export const LINKEDIN_CLIENT_ID = "86z5t5sel4czpt";
export const LINKEDIN_SCOPES = ["openid", "profile", "w_member_social"] as const;
export const LINKEDIN_AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
export const LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
export const LINKEDIN_USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
export const SESSION_TTL_MS = 10 * 60 * 1000;
export const HANDOFF_TTL_MS = 5 * 60 * 1000;

type RuntimeEnv = {
  DB?: D1Database;
  CONTEXTQUILL_LINKEDIN_CLIENT_SECRET?: string;
  CONTEXTQUILL_OAUTH_ENCRYPTION_KEY?: string;
  CONTEXTQUILL_OAUTH_SIGNING_SECRET?: string;
};

export type OAuthSession = {
  id: string;
  oauth_state_hash: string;
  local_state: string;
  callback_uri: string;
  handoff_challenge: string;
  client_fingerprint: string;
  status: string;
  handoff_code_hash: string | null;
  token_ciphertext: string | null;
  token_iv: string | null;
  token_expires_at: number | null;
  member_urn: string | null;
  member_name: string | null;
  scopes: string | null;
  created_at: number;
  expires_at: number;
  consumed_at: number | null;
};

export class OAuthServiceError extends Error {
  constructor(
    message: string,
    public code = "OAUTH_SERVICE_ERROR",
    public status = 400,
  ) {
    super(message);
    this.name = "OAuthServiceError";
  }
}

function runtimeEnv(): RuntimeEnv {
  const current = (globalThis as typeof globalThis & { __CONTEXTQUILL_ENV__?: RuntimeEnv }).__CONTEXTQUILL_ENV__;
  if (!current) throw new OAuthServiceError("OAuth runtime bindings are unavailable.", "RUNTIME_UNAVAILABLE", 503);
  return current;
}

export function getDatabase(): D1Database {
  const db = runtimeEnv().DB;
  if (!db) throw new OAuthServiceError("OAuth database is unavailable.", "DATABASE_UNAVAILABLE", 503);
  return db;
}

export function getSecrets() {
  const current = runtimeEnv();
  const clientSecret = current.CONTEXTQUILL_LINKEDIN_CLIENT_SECRET?.trim();
  const encryptionKey = current.CONTEXTQUILL_OAUTH_ENCRYPTION_KEY?.trim();
  const signingSecret = current.CONTEXTQUILL_OAUTH_SIGNING_SECRET?.trim();
  if (!clientSecret || !encryptionKey || !signingSecret) {
    throw new OAuthServiceError("OAuth service secrets are not configured.", "SECRETS_UNAVAILABLE", 503);
  }
  return { clientSecret, encryptionKey, signingSecret };
}

export function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      Pragma: "no-cache",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function errorResponse(error: unknown) {
  const known = error instanceof OAuthServiceError;
  return jsonResponse(
    {
      error: known ? error.code : "INTERNAL_ERROR",
      message: known ? error.message : "The OAuth service could not complete the request.",
    },
    known ? error.status : 500,
  );
}

export function htmlResponse(title: string, message: string, status = 200) {
  const escape = (value: string) =>
    value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escape(title)}</title><style>body{margin:0;background:#f3f7f6;color:#102a2b;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif}main{max-width:640px;margin:14vh auto;padding:0 24px}.card{background:#fff;border:1px solid #cbdedb;border-radius:24px;padding:38px;box-shadow:0 24px 70px #123c3a14}.mark{width:48px;height:48px;border-radius:14px;background:#155e75;color:#fff;display:grid;place-items:center;font-weight:800}h1{font-size:30px;margin:24px 0 12px}p{color:#466565;line-height:1.65}</style></head><body><main><div class="card"><div class="mark">CQ</div><h1>${escape(title)}</h1><p>${escape(message)}</p></div></main></body></html>`;
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function randomToken(bytes = 32) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return base64Url(value);
}

export function base64Url(value: ArrayBuffer | Uint8Array) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

export function fromBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function sha256(value: string) {
  return base64Url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

export async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64Url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

async function encryptionKey(value: string) {
  const raw = fromBase64Url(value);
  if (raw.byteLength !== 32) {
    throw new OAuthServiceError("The OAuth encryption key must contain 32 bytes.", "INVALID_ENCRYPTION_KEY", 503);
  }
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptToken(token: string, encodedKey: string) {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(encodedKey),
    new TextEncoder().encode(token),
  );
  return { ciphertext: base64Url(ciphertext), iv: base64Url(iv) };
}

export async function decryptToken(ciphertext: string, iv: string, encodedKey: string) {
  try {
    const cleartext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64Url(iv) },
      await encryptionKey(encodedKey),
      fromBase64Url(ciphertext),
    );
    return new TextDecoder().decode(cleartext);
  } catch {
    throw new OAuthServiceError("The one-time credential could not be decrypted.", "HANDOFF_DECRYPTION_FAILED", 500);
  }
}

export function validateLoopbackCallback(value: unknown) {
  let url: URL;
  try {
    url = new URL(String(value || ""));
  } catch {
    throw new OAuthServiceError("callback_uri must be a valid loopback URL.", "INVALID_CALLBACK_URI");
  }
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "[::1]" || url.hostname === "::1";
  if (
    url.protocol !== "http:" ||
    !loopback ||
    !url.port ||
    url.pathname !== "/linkedin/callback" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new OAuthServiceError(
      "callback_uri must be an unadorned http loopback URL ending in /linkedin/callback.",
      "INVALID_CALLBACK_URI",
    );
  }
  return url.toString();
}

export function validateProof(value: unknown, field: string) {
  const proof = String(value || "");
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(proof)) {
    throw new OAuthServiceError(`${field} is invalid.`, "INVALID_HANDOFF_PROOF");
  }
  return proof;
}

export async function ensureSchema(db = getDatabase()) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS oauth_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      oauth_state_hash TEXT NOT NULL UNIQUE,
      local_state TEXT NOT NULL,
      callback_uri TEXT NOT NULL,
      handoff_challenge TEXT NOT NULL,
      client_fingerprint TEXT NOT NULL,
      status TEXT NOT NULL,
      handoff_code_hash TEXT UNIQUE,
      token_ciphertext TEXT,
      token_iv TEXT,
      token_expires_at INTEGER,
      member_urn TEXT,
      member_name TEXT,
      scopes TEXT,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      consumed_at INTEGER
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS oauth_sessions_fingerprint_created_idx ON oauth_sessions(client_fingerprint, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS oauth_sessions_expires_idx ON oauth_sessions(expires_at)"),
  ]);
}

export function normalizeMemberUrn(value: unknown) {
  const cleaned = String(value || "").trim();
  if (!cleaned) throw new OAuthServiceError("LinkedIn did not return a member identifier.", "IDENTITY_MISSING", 502);
  return cleaned.startsWith("urn:li:person:") ? cleaned : `urn:li:person:${cleaned}`;
}

export function parseScopes(value: unknown) {
  if (!value) return [];
  let decoded = String(value);
  try {
    decoded = decodeURIComponent(decoded.replace(/\+/g, "%20"));
  } catch {}
  return [...new Set(decoded.split(/[\s,]+/).map((scope) => scope.trim()).filter(Boolean))];
}

export function requireScopes(value: unknown) {
  const scopes = parseScopes(value);
  const missing = LINKEDIN_SCOPES.filter((scope) => !scopes.includes(scope));
  if (missing.length) {
    throw new OAuthServiceError(`LinkedIn did not grant: ${missing.join(", ")}.`, "SCOPE_MISMATCH", 502);
  }
  return scopes;
}

export function serviceOrigin(request: Request) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}
