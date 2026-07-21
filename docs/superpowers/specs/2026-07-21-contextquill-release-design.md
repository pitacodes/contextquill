# ContextQuill Hosted OAuth Release Design

## Goal

Ship the already validated hosted LinkedIn OAuth flow in the installable ContextQuill plugin, publish the complete release branch to the private GitHub repository after the repository approval gate, and define the path from private beta to public installation.

## Release architecture

The installable plugin remains local-first. Its MCP server runs locally, content data stays in the user's ContextQuill data directory, and LinkedIn credentials stay in that user's macOS Keychain. The plugin initiates OAuth through the production ContextQuill OAuth handoff service at `https://contextquill-oauth.jmvgzw276z.chatgpt.site`; the LinkedIn client secret remains only in that hosted service.

Every installation authorizes its own LinkedIn member. The plugin requests only `openid`, `profile`, and `w_member_social`, binds the returned member identity to the local profile, and publishes only an exact human-approved draft. Reauthorizing a different account replaces the local account binding and removes the old ContextQuill Keychain credential.

## Package contents

The release contains the ContextQuill skill, local MCP server, hosted OAuth client, secure credential adapter, publishing and analytics logic, brand assets, privacy and support documentation, and marketplace metadata. The production OAuth service URL is a shipped default while `CONTEXTQUILL_OAUTH_BASE_URL` remains available for development overrides.

## Distribution paths

### GitHub marketplace beta

The repository will include `.agents/plugins/marketplace.json` with a Git-backed entry for the plugin at the repository root. After the repository is made public, any user can add `pitacodes/contextquill` as a marketplace source and install ContextQuill through Codex. Until then, this route is limited to GitHub users who have repository access.

### Official Plugins Directory

Official public discovery requires an OpenAI plugin submission. Because ContextQuill exposes write tools, the submission must be an app-plus-skills plugin backed by a public production MCP server. The current local-first MCP process is not that server. A later submission project must add a hosted multi-tenant MCP service with per-user authentication and credential isolation, public legal and support pages, domain verification, reviewer-safe demo access, five positive tests, three negative tests, and a verified OpenAI Platform developer or business identity.

## Error handling and safety

- OAuth start and redemption fail closed when the service URL is missing, insecure, unavailable, or returns an untrusted authorization destination.
- The local callback validates state before redeeming a handoff.
- The service never returns or stores a LinkedIn token in ContextQuill's JSON content store.
- Publishing remains blocked until the user types the exact draft-specific approval phrase.
- The release does not change GitHub repository visibility or submit to the OpenAI directory automatically.

## Verification

The release is acceptable only when the core suite, OAuth service suite, plugin validator, secret scan, clean-install package check, and live LinkedIn identity diagnostic all pass. The installed cache must expose `connect_linkedin`, `disconnect_linkedin`, and the existing publishing, review, scheduling, and analytics tools.
