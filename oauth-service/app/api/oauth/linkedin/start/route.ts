import {
  LINKEDIN_AUTHORIZE_URL,
  LINKEDIN_CLIENT_ID,
  LINKEDIN_SCOPES,
  SESSION_TTL_MS,
  ensureSchema,
  errorResponse,
  getDatabase,
  getSecrets,
  hmac,
  jsonResponse,
  randomToken,
  serviceOrigin,
  sha256,
  validateLoopbackCallback,
  validateProof,
} from "@/lib/oauth-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const db = getDatabase();
    const { signingSecret } = getSecrets();
    await ensureSchema(db);
    const input = (await request.json()) as Record<string, unknown>;
    const callbackUri = validateLoopbackCallback(input.callback_uri);
    const localState = validateProof(input.local_state, "local_state");
    const handoffChallenge = validateProof(input.handoff_challenge, "handoff_challenge");
    const now = Date.now();
    await db.prepare("DELETE FROM oauth_sessions WHERE expires_at < ?").bind(now).run();

    const clientIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown";
    const clientFingerprint = await hmac(clientIp.split(",")[0].trim(), signingSecret);
    const recent = await db
      .prepare("SELECT COUNT(*) AS total FROM oauth_sessions WHERE client_fingerprint = ? AND created_at > ?")
      .bind(clientFingerprint, now - 60_000)
      .first<{ total: number }>();
    if (Number(recent?.total || 0) >= 10) {
      return jsonResponse({ error: "RATE_LIMITED", message: "Please wait before starting another connection." }, 429);
    }

    const id = randomToken(24);
    const oauthState = randomToken(32);
    const oauthStateHash = await sha256(oauthState);
    const expiresAt = now + SESSION_TTL_MS;
    await db
      .prepare(`INSERT INTO oauth_sessions (
        id, oauth_state_hash, local_state, callback_uri, handoff_challenge,
        client_fingerprint, status, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`)
      .bind(id, oauthStateHash, localState, callbackUri, handoffChallenge, clientFingerprint, now, expiresAt)
      .run();

    const redirectUri = `${serviceOrigin(request)}/api/oauth/linkedin/callback`;
    const authorizationUrl = new URL(LINKEDIN_AUTHORIZE_URL);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("client_id", LINKEDIN_CLIENT_ID);
    authorizationUrl.searchParams.set("redirect_uri", redirectUri);
    authorizationUrl.searchParams.set("state", oauthState);
    authorizationUrl.searchParams.set("scope", LINKEDIN_SCOPES.join(" "));

    return jsonResponse({
      authorization_url: authorizationUrl.toString(),
      expires_at: new Date(expiresAt).toISOString(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
