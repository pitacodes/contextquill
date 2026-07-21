# LinkedIn OAuth Architecture

## Decision

ContextQuill uses LinkedIn's hosted Authorization Code flow for `openid profile w_member_social` and a one-time, installation-bound credential handoff.

LinkedIn's native PKCE endpoint rejects OpenID scopes, so it cannot both identify a member and authorize self-service publishing for this app. The standard hosted flow supports the required scopes but needs the LinkedIn client secret. That secret therefore exists only in the hosted callback service and is never bundled with the plugin.

## Flow

1. The plugin generates a cryptographically random local state and handoff verifier/challenge.
2. It binds a temporary HTTP listener to a random port on `127.0.0.1`.
3. The plugin sends only its loopback callback, local state, and handoff challenge to the ContextQuill OAuth service.
4. The service validates the loopback callback, rate-limits the start request, stores hashed state and the handoff challenge, and returns a LinkedIn authorization URL.
5. LinkedIn authenticates the member and redirects to the hosted callback.
6. The service validates OAuth state, exchanges the code using the server-only client secret, verifies the member through `userinfo`, and checks all required scopes.
7. The service encrypts the access token with AES-256-GCM and stores it in a handoff record that expires within five minutes.
8. The browser redirects to the plugin's loopback listener with a random one-time handoff code, never the access token.
9. The plugin redeems the code over HTTPS using the verifier that matches the stored challenge.
10. The service atomically claims the handoff, returns the credential once, and clears the encrypted token fields. The plugin stores the token in the user's secure local credential store and closes its listener.

## Account isolation

- Installing the plugin does not carry an authorization or token.
- Every installation must complete OAuth for its own LinkedIn member.
- A stolen browser handoff code cannot be redeemed without the verifier held by the initiating plugin process.
- The OAuth result is bound to the member URN returned by LinkedIn `userinfo`.
- Authorizing a different member stores the new credential first, then removes the previous ContextQuill Keychain entry.
- Tools and diagnostics never return the token.

## Hosted data retention

Pending OAuth sessions expire within ten minutes. Ready handoffs expire within five minutes. The access token is encrypted at rest with AES-256-GCM during that short window. Successful redemption is one-time and clears the ciphertext and IV. The service does not store drafts, published content, browser cookies, or LinkedIn passwords.

## Renewal

LinkedIn currently issues access tokens with an approximately 60-day lifetime. ContextQuill repeats the authorization flow before expiry. When the member is still signed in and the grant remains valid, LinkedIn may bypass the consent screen. Programmatic refresh tokens are limited to approved partner programs and are not assumed.

## Future hosted publishing

This service is deliberately not a persistent token vault. Reliable hosted scheduling or cross-device publishing would require a separate account system, explicit user consent, long-term encrypted credential storage, key rotation, revocation and deletion workflows, audit logs, incident response, and a complete privacy policy.
