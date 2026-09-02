# ContextQuill Privacy Notes

Last updated: September 3, 2026

ContextQuill 0.3 is a free, open-source, local-first tool. These notes describe the repository's default implementation; a fork or third-party deployment may behave differently.

- Content profiles, signals, drafts, posts, metrics, and audit events are stored under the configured ContextQuill data directory.
- Files are written with user-only permissions where the operating system supports them.
- LinkedIn access tokens are read from process environment variables or macOS Keychain.
- LinkedIn access tokens are not written to the ContextQuill JSON store or returned by MCP tools.
- The one-click connection uses LinkedIn's hosted Authorization Code flow, a temporary random-port loopback handoff on `127.0.0.1`, and the operating system's default browser. The LinkedIn client secret exists only in the hosted service.
- The hosted service holds the access token only as an encrypted, installation-bound handoff record for at most five minutes. A successful redemption is one-time and clears the encrypted token fields.
- The local profile may store the authorized member URN, display name, granted scopes, connection time, and expected token-expiry time so ContextQuill can identify the correct account and request reauthorization before publishing fails.
- Authorizing a different member removes the previous account's ContextQuill Keychain credential after the new credential has been stored successfully.
- Live connection verification sends the stored token only to LinkedIn's official `api.linkedin.com/v2/userinfo` endpoint.
- The plugin sends content to LinkedIn only when publishing an exact human-approved draft.
- ContextQuill does not scrape LinkedIn or use browser-session cookies.
- Users remain responsible for ensuring that source material and published content may lawfully be used.
- ContextQuill has no advertising SDK, tracking pixel, or product-analytics collector in the local plugin.
- Deleting the configured ContextQuill data directory removes the local profile, signals, drafts, metrics, and audit history. Disconnecting LinkedIn removes the locally stored credential but does not revoke the app inside LinkedIn; users may revoke it separately in LinkedIn settings.

A future hosted scheduler or hosted MCP service will require a separate explicit consent, retention, deletion, security, and subprocessor policy. The current OAuth handoff service is not a persistent token vault.
