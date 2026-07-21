import {
  HANDOFF_TTL_MS,
  LINKEDIN_CLIENT_ID,
  LINKEDIN_TOKEN_URL,
  LINKEDIN_USERINFO_URL,
  OAuthServiceError,
  OAuthSession,
  encryptToken,
  ensureSchema,
  getDatabase,
  getSecrets,
  htmlResponse,
  normalizeMemberUrn,
  randomToken,
  requireScopes,
  serviceOrigin,
  sha256,
} from "@/lib/oauth-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const db = getDatabase();
    const { clientSecret, encryptionKey } = getSecrets();
    await ensureSchema(db);
    const url = new URL(request.url);
    const state = url.searchParams.get("state") || "";
    const stateHash = await sha256(state);
    const session = await db
      .prepare("SELECT * FROM oauth_sessions WHERE oauth_state_hash = ? AND status = 'PENDING'")
      .bind(stateHash)
      .first<OAuthSession>();
    if (!session || session.expires_at < Date.now()) {
      return htmlResponse("Connection expired", "Return to ContextQuill and start LinkedIn authorization again.", 401);
    }
    const oauthError = url.searchParams.get("error");
    if (oauthError) {
      await db.prepare("UPDATE oauth_sessions SET status = 'DENIED' WHERE id = ?").bind(session.id).run();
      return htmlResponse(
        "LinkedIn not connected",
        url.searchParams.get("error_description") || "Authorization was cancelled.",
        400,
      );
    }
    const code = url.searchParams.get("code");
    if (!code) return htmlResponse("LinkedIn not connected", "LinkedIn did not return an authorization code.", 400);

    const redirectUri = `${serviceOrigin(request)}/api/oauth/linkedin/callback`;
    const tokenResponse = await fetch(LINKEDIN_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: LINKEDIN_CLIENT_ID,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    });
    const token = (await tokenResponse.json().catch(() => ({}))) as Record<string, unknown>;
    if (!tokenResponse.ok || !token.access_token) {
      throw new OAuthServiceError("LinkedIn rejected the authorization code.", "TOKEN_EXCHANGE_FAILED", 502);
    }
    const scopes = requireScopes(token.scope);
    const identityResponse = await fetch(LINKEDIN_USERINFO_URL, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const identity = (await identityResponse.json().catch(() => ({}))) as Record<string, unknown>;
    if (!identityResponse.ok) {
      throw new OAuthServiceError("LinkedIn identity verification failed.", "IDENTITY_VERIFICATION_FAILED", 502);
    }
    const memberUrn = normalizeMemberUrn(identity.sub);
    const memberName = String(identity.name || "").trim();
    const expiresIn = Math.max(60, Number(token.expires_in || 5_184_000));
    const tokenExpiresAt = Date.now() + expiresIn * 1000;
    const handoffCode = randomToken(32);
    const handoffCodeHash = await sha256(handoffCode);
    const encrypted = await encryptToken(String(token.access_token), encryptionKey);
    const handoffExpiresAt = Math.min(session.expires_at, Date.now() + HANDOFF_TTL_MS);
    await db
      .prepare(`UPDATE oauth_sessions SET
        status = 'READY', handoff_code_hash = ?, token_ciphertext = ?, token_iv = ?,
        token_expires_at = ?, member_urn = ?, member_name = ?, scopes = ?, expires_at = ?
        WHERE id = ? AND status = 'PENDING'`)
      .bind(
        handoffCodeHash,
        encrypted.ciphertext,
        encrypted.iv,
        tokenExpiresAt,
        memberUrn,
        memberName,
        scopes.join(" "),
        handoffExpiresAt,
        session.id,
      )
      .run();

    const localCallback = new URL(session.callback_uri);
    localCallback.searchParams.set("state", session.local_state);
    localCallback.searchParams.set("handoff_code", handoffCode);
    return Response.redirect(localCallback.toString(), 302);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The authorization could not be completed.";
    return htmlResponse("LinkedIn not connected", message, 502);
  }
}
