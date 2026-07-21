import {
  OAuthServiceError,
  OAuthSession,
  decryptToken,
  ensureSchema,
  errorResponse,
  getDatabase,
  getSecrets,
  jsonResponse,
  sha256,
  validateProof,
} from "@/lib/oauth-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const db = getDatabase();
    const { encryptionKey } = getSecrets();
    await ensureSchema(db);
    const input = (await request.json()) as Record<string, unknown>;
    const handoffCode = validateProof(input.handoff_code, "handoff_code");
    const handoffVerifier = validateProof(input.handoff_verifier, "handoff_verifier");
    const codeHash = await sha256(handoffCode);
    const session = await db
      .prepare("SELECT * FROM oauth_sessions WHERE handoff_code_hash = ? AND status = 'READY'")
      .bind(codeHash)
      .first<OAuthSession>();
    if (!session || session.expires_at < Date.now()) {
      throw new OAuthServiceError("The one-time handoff is invalid or expired.", "HANDOFF_EXPIRED", 410);
    }
    if ((await sha256(handoffVerifier)) !== session.handoff_challenge) {
      throw new OAuthServiceError("The handoff proof did not match this installation.", "HANDOFF_PROOF_MISMATCH", 401);
    }
    const claim = await db
      .prepare("UPDATE oauth_sessions SET status = 'CLAIMED' WHERE id = ? AND status = 'READY'")
      .bind(session.id)
      .run();
    if (Number(claim.meta?.changes || 0) !== 1) {
      throw new OAuthServiceError("The one-time handoff was already used.", "HANDOFF_ALREADY_USED", 409);
    }
    if (!session.token_ciphertext || !session.token_iv || !session.member_urn || !session.token_expires_at) {
      throw new OAuthServiceError("The one-time handoff is incomplete.", "HANDOFF_INCOMPLETE", 500);
    }
    const accessToken = await decryptToken(session.token_ciphertext, session.token_iv, encryptionKey);
    await db
      .prepare(`UPDATE oauth_sessions SET
        status = 'CONSUMED', consumed_at = ?, token_ciphertext = NULL, token_iv = NULL
        WHERE id = ? AND status = 'CLAIMED'`)
      .bind(Date.now(), session.id)
      .run();
    return jsonResponse({
      access_token: accessToken,
      member_urn: session.member_urn,
      member_name: session.member_name || "",
      token_expires_at: new Date(session.token_expires_at).toISOString(),
      scopes: String(session.scopes || "").split(/\s+/).filter(Boolean),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
