import { execFileSync } from "node:child_process";

export const LINKEDIN_TOKEN_SERVICE = "contextquill-linkedin-access-token";

export function getLinkedInToken(memberUrn) {
  if (process.platform !== "darwin" || !memberUrn) return "";
  try {
    return execFileSync(
      "security",
      ["find-generic-password", "-s", LINKEDIN_TOKEN_SERVICE, "-a", memberUrn, "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
  } catch {
    return "";
  }
}

export function storeLinkedInToken(memberUrn, accessToken) {
  if (process.platform !== "darwin") {
    throw new Error(
      "Automatic secure credential storage currently requires macOS Keychain. On other systems, use LINKEDIN_ACCESS_TOKEN and LINKEDIN_MEMBER_URN.",
    );
  }
  execFileSync(
    "security",
    ["add-generic-password", "-U", "-s", LINKEDIN_TOKEN_SERVICE, "-a", memberUrn, "-w", accessToken],
    { stdio: "ignore" },
  );
}

export function deleteLinkedInToken(memberUrn) {
  if (process.platform !== "darwin" || !memberUrn) return false;
  try {
    execFileSync(
      "security",
      ["delete-generic-password", "-s", LINKEDIN_TOKEN_SERVICE, "-a", memberUrn],
      { stdio: "ignore" },
    );
    return true;
  } catch {
    return false;
  }
}
