# ContextQuill Local Privacy Notes

ContextQuill v0.1 is local-first.

- Content profiles, signals, drafts, posts, metrics, and audit events are stored under the configured ContextQuill data directory.
- Files are written with user-only permissions where the operating system supports them.
- LinkedIn access tokens are read from process environment variables or macOS Keychain.
- LinkedIn access tokens are not written to the ContextQuill JSON store or returned by MCP tools.
- The local profile may store the authorized member URN, display name, connection time, and expected token-expiry time so ContextQuill can identify the correct account and request reauthorization before publishing fails.
- Live connection verification sends the stored token only to LinkedIn's official `api.linkedin.com/v2/userinfo` endpoint.
- The plugin sends content to LinkedIn only when publishing an exact human-approved draft.
- ContextQuill does not scrape LinkedIn or use browser-session cookies.
- Users remain responsible for ensuring that source material and published content may lawfully be used.

Before a hosted or publicly distributed version is launched, this local note must be replaced by a complete privacy policy, retention policy, deletion process, and subprocessor disclosure.
