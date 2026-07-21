#!/usr/bin/env node
import { stdin as input, stdout as output } from "node:process";
import { createStore } from "../lib/core.mjs";
import { LINKEDIN_SCOPES } from "../lib/linkedin-oauth.mjs";
import { storeLinkedInToken } from "../lib/secure-credentials.mjs";

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
let memberName = "";
try {
  const response = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(
      `LinkedIn identity verification returned HTTP ${response.status}. Generate the token with openid, profile, and w_member_social.`,
    );
  }
  const identity = await response.json();
  if (identity?.sub) memberUrn = normalizeUrn(identity.sub);
  memberName = String(identity?.name || "").trim();
} catch (error) {
  throw new Error(`Could not verify the LinkedIn token: ${error.message}`);
}
if (!memberUrn || memberUrn === "urn:li:person:") {
  throw new Error("LinkedIn did not return a member identifier. Generate the token with openid and profile.");
}

storeLinkedInToken(memberUrn, token);

const store = createStore();
const ttlSeconds = Number(process.env.LINKEDIN_TOKEN_TTL_SECONDS || 5_184_000);
const connectedAt = new Date();
const expiresAt = new Date(connectedAt.getTime() + ttlSeconds * 1000);
const profile = await store.configureProfile({
  linkedin_member_urn: memberUrn,
  linkedin_member_name: memberName,
  linkedin_connected_at: connectedAt.toISOString(),
  linkedin_token_expires_at: expiresAt.toISOString(),
  linkedin_scopes: LINKEDIN_SCOPES,
});
process.stdout.write(
  `LinkedIn connection stored in macOS Keychain for ${profile.linkedin_member_name || profile.linkedin_member_urn}. ` +
    `Reauthorization is expected by ${profile.linkedin_token_expires_at}. ` +
    "The access token was not written to ContextQuill data files.\n",
);
