#!/usr/bin/env node
import readline from "node:readline/promises";
import { execFileSync } from "node:child_process";
import { stdin as input, stdout as output } from "node:process";
import { createStore } from "../lib/core.mjs";

function normalizeUrn(value) {
  const cleaned = String(value || "").trim();
  if (cleaned.startsWith("urn:li:person:")) return cleaned;
  return `urn:li:person:${cleaned}`;
}

async function hiddenPrompt(label) {
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    throw new Error("A real terminal is required so the token can be entered without echo.");
  }
  output.write(label);
  input.setRawMode(true);
  input.resume();
  let value = "";
  return new Promise((resolve, reject) => {
    const onData = (chunk) => {
      const text = chunk.toString("utf8");
      for (const char of text) {
        if (char === "\u0003") {
          input.setRawMode(false);
          input.pause();
          input.off("data", onData);
          output.write("\n");
          reject(new Error("Cancelled."));
          return;
        }
        if (char === "\r" || char === "\n") {
          input.setRawMode(false);
          input.pause();
          input.off("data", onData);
          output.write("\n");
          resolve(value.trim());
          return;
        }
        if (char === "\u007f") value = value.slice(0, -1);
        else value += char;
      }
    };
    input.on("data", onData);
  });
}

if (process.platform !== "darwin") {
  throw new Error(
    "This secure helper currently uses macOS Keychain. On other systems, provide LINKEDIN_ACCESS_TOKEN and LINKEDIN_MEMBER_URN through the process environment.",
  );
}

const token = await hiddenPrompt("LinkedIn access token (hidden): ");
if (!token) throw new Error("An access token is required.");

let memberUrn = "";
try {
  const response = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.ok) {
    const profile = await response.json();
    if (profile?.sub) memberUrn = normalizeUrn(profile.sub);
  }
} catch {
  // Some valid publishing tokens do not include the OIDC profile scope.
}

if (!memberUrn) {
  const rl = readline.createInterface({ input, output });
  const memberInput = await rl.question(
    "The token does not expose an OIDC profile. Enter the LinkedIn member ID or urn:li:person:...: ",
  );
  rl.close();
  memberUrn = normalizeUrn(memberInput);
}
if (memberUrn === "urn:li:person:") throw new Error("A LinkedIn member ID is required.");

execFileSync(
  "security",
  ["add-generic-password", "-U", "-s", "contextquill-linkedin-access-token", "-a", memberUrn, "-w", token],
  { stdio: "ignore" },
);

const store = createStore();
const profile = await store.configureProfile({ linkedin_member_urn: memberUrn });
process.stdout.write(
  `LinkedIn connection stored in macOS Keychain for ${profile.linkedin_member_urn}. ` +
    "The access token was not written to ContextQuill data files.\n",
);
