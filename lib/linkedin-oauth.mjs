import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { deleteLinkedInToken, storeLinkedInToken } from "./secure-credentials.mjs";

export const LINKEDIN_CLIENT_ID = "86z5t5sel4czpt";
export const LINKEDIN_SCOPES = Object.freeze(["openid", "profile", "w_member_social"]);
export const LINKEDIN_CALLBACK_PATH = "/linkedin/callback";
export const DEFAULT_CONTEXTQUILL_OAUTH_BASE_URL = "https://contextquill-oauth.jmvgzw276z.chatgpt.site";

export class LinkedInOAuthError extends Error {
  constructor(message, code = "LINKEDIN_OAUTH_ERROR", details = undefined) {
    super(message);
    this.name = "LinkedInOAuthError";
    this.code = code;
    this.details = details;
  }
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function normalizeMemberUrn(value) {
  const cleaned = String(value || "").trim();
  if (!cleaned) return "";
  return cleaned.startsWith("urn:li:person:") ? cleaned : `urn:li:person:${cleaned}`;
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

function parseScopes(value) {
  if (!value) return [];
  const source = Array.isArray(value) ? value.join(" ") : String(value);
  return [...new Set(source.split(/[\s,]+/).map((scope) => scope.trim()).filter(Boolean))];
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function browserPage(title, message, success = false) {
  const color = success ? "#0f766e" : "#b91c1c";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;max-width:680px;margin:12vh auto;padding:0 24px;color:#0f172a}main{border:1px solid #cbd5e1;border-radius:18px;padding:32px;box-shadow:0 14px 40px #0f172a14}h1{color:${color};font-size:28px}p{line-height:1.6;color:#334155}</style></head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><p>You can close this tab and return to ContextQuill.</p></main></body></html>`;
}

function sendHtml(response, status, title, message, success = false) {
  const body = browserPage(title, message, success);
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

function serviceUrl(value) {
  const source = String(value || "").trim().replace(/\/+$/g, "");
  if (!source) {
    throw new LinkedInOAuthError(
      "ContextQuill's hosted OAuth service is not configured yet.",
      "OAUTH_SERVICE_NOT_CONFIGURED",
    );
  }
  let url;
  try {
    url = new URL(source);
  } catch {
    throw new LinkedInOAuthError("The ContextQuill OAuth service URL is invalid.", "OAUTH_SERVICE_INVALID");
  }
  const local = url.protocol === "http:" && new Set(["127.0.0.1", "localhost", "[::1]"]).has(url.hostname);
  if (url.protocol !== "https:" && !local) {
    throw new LinkedInOAuthError("The ContextQuill OAuth service must use HTTPS.", "OAUTH_SERVICE_INSECURE");
  }
  return url.toString().replace(/\/$/, "");
}

async function serviceRequest(url, init, fetchImpl, label) {
  let response;
  try {
    response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    throw new LinkedInOAuthError(`${label} failed: ${error.message}`, "OAUTH_SERVICE_UNAVAILABLE");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new LinkedInOAuthError(
      String(payload.message || `${label} returned HTTP ${response.status}.`),
      String(payload.error || "OAUTH_SERVICE_ERROR"),
    );
  }
  return payload;
}

export function createHandoffProof() {
  const verifier = base64Url(randomBytes(64));
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export async function startHostedLinkedInOAuth({
  oauthBaseUrl,
  callbackUri,
  localState,
  handoffChallenge,
  fetchImpl = globalThis.fetch,
}) {
  const baseUrl = serviceUrl(oauthBaseUrl);
  const payload = await serviceRequest(
    `${baseUrl}/api/oauth/linkedin/start`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_uri: callbackUri,
        local_state: localState,
        handoff_challenge: handoffChallenge,
      }),
    },
    fetchImpl,
    "Starting LinkedIn authorization",
  );
  let authorizationUrl;
  try {
    authorizationUrl = new URL(payload.authorization_url);
  } catch {
    throw new LinkedInOAuthError("The OAuth service returned an invalid authorization URL.", "OAUTH_SERVICE_INVALID_RESPONSE");
  }
  if (
    authorizationUrl.origin !== "https://www.linkedin.com" ||
    authorizationUrl.pathname !== "/oauth/v2/authorization"
  ) {
    throw new LinkedInOAuthError("The OAuth service returned an untrusted authorization destination.", "OAUTH_SERVICE_UNTRUSTED");
  }
  return { authorizationUrl: authorizationUrl.toString(), serviceBaseUrl: baseUrl };
}

export async function redeemHostedLinkedInOAuth({
  oauthBaseUrl,
  handoffCode,
  handoffVerifier,
  fetchImpl = globalThis.fetch,
}) {
  const baseUrl = serviceUrl(oauthBaseUrl);
  const payload = await serviceRequest(
    `${baseUrl}/api/oauth/linkedin/redeem`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handoff_code: handoffCode, handoff_verifier: handoffVerifier }),
    },
    fetchImpl,
    "Redeeming LinkedIn authorization",
  );
  const memberUrn = normalizeMemberUrn(payload.member_urn);
  const accessToken = String(payload.access_token || "").trim();
  const scopes = parseScopes(payload.scopes);
  const missingScopes = LINKEDIN_SCOPES.filter((scope) => !scopes.includes(scope));
  if (!memberUrn || !accessToken || missingScopes.length) {
    throw new LinkedInOAuthError(
      missingScopes.length
        ? `LinkedIn did not grant required scopes: ${missingScopes.join(", ")}.`
        : "The OAuth service returned an incomplete credential.",
      missingScopes.length ? "OAUTH_SCOPE_MISMATCH" : "OAUTH_SERVICE_INVALID_RESPONSE",
      { missing_scopes: missingScopes },
    );
  }
  const tokenExpiresAt = new Date(payload.token_expires_at);
  if (Number.isNaN(tokenExpiresAt.getTime())) {
    throw new LinkedInOAuthError("The OAuth service returned an invalid token expiry.", "OAUTH_SERVICE_INVALID_RESPONSE");
  }
  return {
    memberUrn,
    memberName: String(payload.member_name || "").trim(),
    accessToken,
    scopes,
    tokenExpiresAt: tokenExpiresAt.toISOString(),
  };
}

export function openSystemBrowser(url) {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true }, (error) => {
      if (error) reject(new LinkedInOAuthError(`Could not open the system browser: ${error.message}`, "BROWSER_OPEN_FAILED"));
      else resolve();
    });
  });
}

export async function connectLinkedInViaHostedOAuth({
  store,
  oauthBaseUrl = process.env.CONTEXTQUILL_OAUTH_BASE_URL || DEFAULT_CONTEXTQUILL_OAUTH_BASE_URL,
  fetchImpl = globalThis.fetch,
  openBrowser = openSystemBrowser,
  credentialStore = storeLinkedInToken,
  credentialDelete = deleteLinkedInToken,
  serverFactory = createServer,
  timeoutMs = 300_000,
} = {}) {
  if (!store?.configureProfile) {
    throw new LinkedInOAuthError("A ContextQuill store is required.", "OAUTH_CONFIGURATION_ERROR");
  }
  const localState = base64Url(randomBytes(32));
  const { verifier: handoffVerifier, challenge: handoffChallenge } = createHandoffProof();
  let redirectUri = "";
  let finish;
  let rejectFinish;
  const completion = new Promise((resolve, reject) => {
    finish = resolve;
    rejectFinish = reject;
  });
  completion.catch(() => {});
  let completed = false;
  const settle = (callback, value) => {
    if (completed) return;
    completed = true;
    callback(value);
  };

  const server = serverFactory(async (request, response) => {
    const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
    if (requestUrl.pathname !== LINKEDIN_CALLBACK_PATH) {
      sendHtml(response, 404, "Not found", "This callback belongs to a different request.");
      return;
    }
    if (!safeEqual(requestUrl.searchParams.get("state"), localState)) {
      sendHtml(response, 401, "Connection blocked", "The local OAuth state did not match. Start the connection again.");
      settle(rejectFinish, new LinkedInOAuthError("LinkedIn OAuth state mismatch.", "OAUTH_STATE_MISMATCH"));
      return;
    }
    const handoffCode = requestUrl.searchParams.get("handoff_code");
    if (!handoffCode) {
      sendHtml(response, 400, "LinkedIn not connected", "The hosted service did not return a handoff code.");
      settle(rejectFinish, new LinkedInOAuthError("OAuth handoff code missing.", "OAUTH_HANDOFF_MISSING"));
      return;
    }
    try {
      const credential = await redeemHostedLinkedInOAuth({
        oauthBaseUrl,
        handoffCode,
        handoffVerifier,
        fetchImpl,
      });
      const previousProfile = await store.getProfile();
      const previousMemberUrn = normalizeMemberUrn(previousProfile.linkedin_member_urn);
      await credentialStore(credential.memberUrn, credential.accessToken);
      if (previousMemberUrn && previousMemberUrn !== credential.memberUrn) {
        await credentialDelete(previousMemberUrn);
      }
      const profile = await store.configureProfile({
        linkedin_member_urn: credential.memberUrn,
        linkedin_member_name: credential.memberName,
        linkedin_connected_at: new Date().toISOString(),
        linkedin_token_expires_at: credential.tokenExpiresAt,
        linkedin_scopes: credential.scopes,
      });
      sendHtml(
        response,
        200,
        "LinkedIn connected",
        `${profile.linkedin_member_name || "Your LinkedIn account"} is ready for reviewed ContextQuill posts.`,
        true,
      );
      settle(finish, {
        connected: true,
        identity_verified: true,
        member_urn: credential.memberUrn,
        member_name: credential.memberName,
        token_expires_at: credential.tokenExpiresAt,
        granted_scopes: credential.scopes,
        credential_source: process.platform === "darwin" ? "macOS Keychain" : "secure credential store",
        oauth_mode: "hosted_authorization_code",
        oauth_service: new URL(serviceUrl(oauthBaseUrl)).origin,
      });
    } catch (error) {
      sendHtml(response, 502, "LinkedIn not connected", error.message || "The one-time handoff failed.");
      settle(rejectFinish, error);
    }
  });

  const timeout = setTimeout(() => {
    settle(rejectFinish, new LinkedInOAuthError("LinkedIn authorization timed out.", "OAUTH_TIMEOUT"));
  }, timeoutMs);
  timeout.unref?.();

  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new LinkedInOAuthError("Could not start the local OAuth handoff listener.", "OAUTH_CALLBACK_FAILED");
    }
    redirectUri = `http://127.0.0.1:${address.port}${LINKEDIN_CALLBACK_PATH}`;
    const started = await startHostedLinkedInOAuth({
      oauthBaseUrl,
      callbackUri: redirectUri,
      localState,
      handoffChallenge,
      fetchImpl,
    });
    await openBrowser(started.authorizationUrl);
    return await completion;
  } finally {
    clearTimeout(timeout);
    await new Promise((resolve) => server.close(resolve)).catch(() => {});
  }
}
