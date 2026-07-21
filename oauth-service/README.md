# ContextQuill OAuth Service

This service completes LinkedIn's hosted Authorization Code flow for ContextQuill plugin installations without becoming a persistent token vault.

## Routes

- `POST /api/oauth/linkedin/start` validates a loopback callback and installation-bound handoff challenge, stores hashed OAuth state, and returns LinkedIn's authorization URL.
- `GET /api/oauth/linkedin/callback` exchanges LinkedIn's code using the server-only client secret, verifies the member and scopes, encrypts the token temporarily, and redirects a one-time handoff code to the initiating plugin.
- `POST /api/oauth/linkedin/redeem` atomically redeems the handoff using the initiating plugin's verifier, returns the credential once, and clears the encrypted token fields.

## Required environment values

- `CONTEXTQUILL_LINKEDIN_CLIENT_SECRET`: the secret for LinkedIn app Client ID `86z5t5sel4czpt`.
- `CONTEXTQUILL_OAUTH_ENCRYPTION_KEY`: a base64url-encoded 32-byte key used for AES-256-GCM.
- `CONTEXTQUILL_OAUTH_SIGNING_SECRET`: a high-entropy secret used to pseudonymize rate-limit fingerprints.

Never commit real values. Local values belong in `.env.local`; hosted values are managed by the hosting platform.

## Storage and retention

The D1 `DB` binding stores OAuth sessions only. Pending sessions expire within ten minutes and ready handoffs within five minutes. Access tokens are encrypted at rest during the handoff window and removed after one successful redemption. The service does not store ContextQuill drafts, posts, browser cookies, or LinkedIn passwords.

## Validation

```text
npm test
```

The production LinkedIn app must register the exact deployed callback URL:

```text
https://<oauth-service-host>/api/oauth/linkedin/callback
```
