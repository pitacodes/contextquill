# Public distribution

ContextQuill 0.3 uses one public repository as source, marketplace, documentation site, and release archive origin.

## Distribution channels

### OpenAI plugin marketplace source

The repository includes `.agents/plugins/marketplace.json`. Users add it with:

```bash
codex plugin marketplace add pitacodes/contextquill
codex plugin add contextquill@contextquill
```

This GitHub-backed marketplace is the immediate public distribution path. A future listing in OpenAI's universal public plugin directory requires a separate platform review.

### Claude plugin marketplace source

The repository includes `.claude-plugin/marketplace.json` and `.claude-plugin/plugin.json`. Users add it with:

```text
/plugin marketplace add pitacodes/contextquill
/plugin install contextquill@contextquill
```

The Claude manifest starts the local MCP server from the installed plugin directory and reuses the same ContextQuill skill.

### GitHub release downloads

Every `v*` tag runs `.github/workflows/release.yml`, tests the project, builds two archives, and creates a GitHub release:

- `contextquill-plugin.zip` for custom-plugin upload or manual MCP installation;
- `contextquill-codex-marketplace.zip` for a self-contained local Codex marketplace.

The stable download page is:

```text
https://github.com/pitacodes/contextquill/releases/latest
```

## What remains local

The installable MCP server runs on the user's machine. Profiles, signals, drafts, schedules, metrics, and audit events stay in the configured local data directory. On macOS, LinkedIn credentials stay in the user's Keychain.

The hosted OAuth service performs only the short-lived LinkedIn code exchange and installation-bound handoff. It is not a hosted ContextQuill account system, scheduler, content database, or general MCP endpoint.

## Cloud-only agent limitation

Cloud-only agent sessions cannot reach a local stdio MCP server. Supporting those sessions requires a public HTTPS MCP deployment with:

- ContextQuill user authentication and per-user authorization;
- encrypted long-term LinkedIn token storage, rotation, revocation, and deletion;
- hosted drafts, approval hashes, schedules, publishing jobs, and audit controls;
- public privacy, retention, incident-response, and subprocessor documentation.

That system must be reviewed as a separate security and privacy project. It must not be approximated by turning the short-lived OAuth handoff service into a persistent token vault.

## OpenAI public-directory path

OpenAI's public plugin directory is shared across supported ChatGPT and Codex surfaces. A directory submission should begin only after the complete hosted MCP version exists. Submission readiness includes:

- a stable production HTTPS `/mcp` endpoint;
- user authentication and per-user LinkedIn authorization;
- correct MCP tool metadata and write-action annotations;
- verified developer identity and domain;
- public privacy policy, terms, support, and deletion instructions;
- reviewer-safe demo access and representative positive and negative test prompts;
- validation that no tool can bypass the draft-specific human approval gate.

Until then, the GitHub marketplace and release archives are the honest public beta channels.

## Release checklist

1. Align the version in `package.json`, both plugin manifests, the Claude marketplace, MCP server metadata, diagnostics, and changelog.
2. Run `npm test` and the OAuth service build/tests.
3. Run both plugin validators where their CLIs are available.
4. Build the release archives with `npm run package` and inspect their file lists.
5. Scan the current tree and full Git history for credentials, private content, callback URLs, and local data.
6. Merge through the repository approval workflow.
7. Confirm repository visibility is public and private vulnerability reporting is enabled.
8. Tag the merged commit, allowing the release workflow to create the public download.
9. Test a clean install from both the GitHub marketplace and release archive.
