# Security policy

## Supported version

Security fixes are applied to the latest release on `main`.

## Report a vulnerability

Do not open a public issue with credentials, OAuth codes, private content, personal data, or an exploitable vulnerability.

Use GitHub's private vulnerability reporting for this repository. If that option is unavailable, open a public issue containing only the phrase “Private security contact requested” and no sensitive detail.

Include, through the private channel:

- affected ContextQuill version
- operating system and agent host
- concise reproduction steps
- likely impact
- whether any token, post, or local content may have been exposed

## Credential model

- LinkedIn client secrets remain in the hosted OAuth service and are not included in the plugin.
- On macOS, member access tokens are stored in System Keychain.
- Environment-provided tokens remain the user's responsibility on platforms without supported native credential storage.
- Access tokens are never written to the ContextQuill JSON content store or returned by MCP tools.
- The hosted OAuth handoff encrypts tokens temporarily, expires records quickly, and clears token material after successful redemption.

## Public issue hygiene

Before attaching logs or diagnostics, remove:

- access tokens, authorization codes, and callback URLs
- browser cookies and session data
- private customer or employer content
- local usernames and sensitive filesystem paths
- files from the ContextQuill data directory
