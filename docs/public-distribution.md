# ContextQuill Public Distribution

## Current release model

ContextQuill v0.2 is a local-first plugin. Its MCP server runs on the user's machine, its content data stays in the user's selected ContextQuill data directory, and its LinkedIn access token stays in that user's macOS Keychain. The hosted OAuth service performs only the short-lived LinkedIn code exchange and installation-bound handoff.

## Route 1: GitHub marketplace beta

This is the fastest path for external beta users because it preserves the current local-first architecture.

Once `https://github.com/pitacodes/contextquill` is public, a user can add its marketplace and install the plugin:

```text
codex plugin marketplace add pitacodes/contextquill
codex plugin add contextquill@contextquill
```

The user then starts a new Codex session and asks ContextQuill to connect LinkedIn. LinkedIn handles authentication and consent; the plugin binds only the account that user authorizes.

While the repository remains private, this installation route works only for GitHub users and environments that have access to the repository. Making the repository public is a separate owner decision and is not part of the release push.

The GitHub marketplace format and CLI installation workflow are documented in OpenAI's [Build plugins guide](https://developers.openai.com/codex/plugins/build).

## Route 2: Official OpenAI Plugins Directory

The official directory provides public discovery and installation in ChatGPT Work mode, the ChatGPT desktop app, and Codex. OpenAI's current process requires submitting through the [plugin submission portal](https://platform.openai.com/apps-manage) and completing review before the developer can publish.

ContextQuill should be submitted as an app-plus-skills plugin because LinkedIn publishing is implemented through MCP tools. The submission requires:

- an OpenAI Platform organization with Apps Management write access;
- a verified individual or business developer identity;
- public website, support, privacy-policy, and terms URLs that match the publisher;
- a public production MCP server URL;
- domain verification and a content security policy for the MCP host;
- accurate schemas and `readOnlyHint`, `openWorldHint`, and `destructiveHint` annotations for every tool;
- a final skill bundle and realistic starter prompts;
- exactly five positive and three negative reviewer test cases;
- country or region availability, release notes, and policy attestations;
- OpenAI review and an explicit publish action after approval.

The authoritative checklist is OpenAI's [Submit plugins guide](https://learn.chatgpt.com/docs/submit-plugins).

## Architecture gap for directory submission

The existing MCP server is a local stdio process and stores each member's token in that member's local Keychain. The submission portal requires a public production MCP URL for plugins that contain apps. Therefore, the current package is suitable for GitHub marketplace distribution but is not yet an official-directory production backend.

An official-directory version needs a separate hosted multi-tenant MCP project with:

- ContextQuill user authentication and per-user authorization;
- encrypted long-term LinkedIn token storage, rotation, revocation, deletion, and audit controls;
- hosted drafts, approval hashes, schedules, and publishing jobs, or a clearly defined hybrid protocol with the local client;
- a public privacy policy, subprocessors, retention rules, incident response, and support process;
- reviewer-safe demo accounts that do not require MFA, SMS, email confirmation, or private-network access.

This work should not be folded into the local OAuth handoff service. That service deliberately avoids becoming a persistent token vault.

## Recommended sequence

1. Release v0.2 to the private GitHub repository and test a clean install.
2. Invite a small beta group with repository access.
3. When the beta is stable, choose whether to make the marketplace repository public or publish a separate public distribution repository.
4. Build the hosted multi-tenant MCP service as a separately reviewed project.
5. Prepare the eight reviewer test cases, legal pages, verified identity, domain challenge, and submission materials.
6. Submit through OpenAI, address review findings, and publish after approval.
