#!/usr/bin/env node
import { execFile } from "node:child_process";

const clientId = process.env.LINKEDIN_CLIENT_ID || "86z5t5sel4czpt";
const url = `https://www.linkedin.com/developers/tools/oauth/token-generator?clientId=${encodeURIComponent(clientId)}`;

process.stdout.write(
  [
    "Open LinkedIn's official OAuth token generator:",
    url,
    "",
    "Select openid, profile, and w_member_social. After LinkedIn generates the token, run `npm run connect-linkedin` and paste it into the hidden prompt.",
    "",
  ].join("\n"),
);

if (process.platform === "darwin") {
  execFile("open", [url], { stdio: "ignore" }, () => {});
}
