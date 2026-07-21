# ContextQuill Hosted OAuth Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Release a complete ContextQuill plugin with one-click per-user LinkedIn OAuth, publish the reviewed branch to GitHub, and prepare both marketplace beta and official-directory distribution paths.

**Architecture:** Keep the plugin and user credentials local, use the deployed OAuth service only for the short-lived LinkedIn code exchange and installation-bound handoff, and package the repo as a Git-backed Codex marketplace plugin. Treat official OpenAI directory submission as a separate hosted-MCP project because the current MCP server and credential store are local processes.

**Tech Stack:** Node.js 20+, MCP over stdio, macOS Keychain, LinkedIn OAuth 2.0 and UGC APIs, Next.js/Vinext OAuth service, Codex plugin manifest and marketplace metadata.

## Global Constraints

- Keep all product UI, documentation, prompts, reports, and approval phrases in English.
- Never commit LinkedIn access tokens, OAuth secrets, member credentials, browser-session data, or private content-vault data.
- Preserve the exact human-review gate; editing an approved post must revoke approval.
- Do not push or merge until the owner types `APPROVE GITHUB codex/hosted-linkedin-oauth` after reviewing the final diff and validation results.

---

### Task 1: Ship the production OAuth endpoint

**Files:**
- Modify: `tests/linkedin-oauth.test.mjs`
- Modify: `lib/linkedin-oauth.mjs`

**Interfaces:**
- Consumes: `connectLinkedInViaHostedOAuth({ store, oauthBaseUrl? })`
- Produces: `DEFAULT_CONTEXTQUILL_OAUTH_BASE_URL` set to the deployed HTTPS service while preserving the environment override.

- [ ] Add a test asserting that the default OAuth origin is the deployed ContextQuill service and is accepted by `startHostedLinkedInOAuth`.
- [ ] Run `node --test tests/linkedin-oauth.test.mjs` and confirm the new assertion fails because the default is empty.
- [ ] Set the production default in `lib/linkedin-oauth.mjs`.
- [ ] Run `node --test tests/linkedin-oauth.test.mjs` with localhost permission and confirm all OAuth tests pass.

### Task 2: Package all current plugin features

**Files:**
- Modify: `.codex-plugin/plugin.json`
- Create: `.agents/plugins/marketplace.json`
- Modify: `README.md`
- Modify: `PRIVACY.md`
- Create: `TERMS.md`
- Create: `SUPPORT.md`

**Interfaces:**
- Consumes: the root plugin manifest, `.mcp.json`, `skills/contextquill/SKILL.md`, and `mcp/server.mjs`.
- Produces: a strict-semver installable plugin and a Git-backed marketplace entry named `contextquill`.

- [ ] Update release metadata, author identity, repository link, production descriptions, and starter prompts without adding inaccessible or invented contact details.
- [ ] Add marketplace metadata with `AVAILABLE`, `ON_USE`, and `Productivity` policies and a Git URL pointing to the repository root.
- [ ] Add public-facing terms and support documents and explain the beta-versus-directory distribution routes in the README.
- [ ] Run the plugin-creator cachebuster helper and validator.

### Task 3: Verify source, service, and clean installation

**Files:**
- Test: `tests/*.test.mjs`
- Test: `oauth-service/tests/*.test.mjs`
- Inspect: the complete tracked file set and a temporary installed plugin copy.

**Interfaces:**
- Consumes: the release tree.
- Produces: evidence that the package exposes the current OAuth, publishing, approval, scheduling, analytics, privacy, and marketplace behavior without secrets.

- [ ] Run `npm test` with localhost permission and require zero failures.
- [ ] Run `npm test` in `oauth-service` and require a successful production build and zero test failures.
- [ ] Run `python3 /Users/peter_air/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py .` and require success.
- [ ] Search tracked and staged files for real OAuth secrets, access tokens, browser callbacks, and private data paths; require no matches beyond documented variable names and test fixtures.
- [ ] Copy only the distributable tracked files into a temporary directory, run the validator and test suite there, and inspect MCP tool discovery for `connect_linkedin`, `disconnect_linkedin`, `publish_approved_post`, and analytics tools.

### Task 4: Publish the reviewed GitHub branch

**Files:**
- Commit: all reviewed release files on `codex/hosted-linkedin-oauth`.

**Interfaces:**
- Consumes: the final diff and validation evidence.
- Produces: a pushed GitHub branch and pull request, followed by a squash merge only after the exact repository approval phrase.

- [ ] Show the owner the diff summary, validation results, and branch name.
- [ ] Wait for the exact phrase `APPROVE GITHUB codex/hosted-linkedin-oauth`.
- [ ] Stage the approved files and commit them without changing content after approval.
- [ ] Push `codex/hosted-linkedin-oauth`, open a pull request, and squash-merge it to `main`.
- [ ] Report the resulting main-branch commit.

### Task 5: Prepare public distribution

**Files:**
- Create: `docs/public-distribution.md`

**Interfaces:**
- Consumes: OpenAI's current Build plugins and Submit plugins requirements.
- Produces: an actionable beta installation guide and an official-directory submission checklist.

- [ ] Document the GitHub marketplace commands and state clearly that broad installation requires a public repository or explicit GitHub access.
- [ ] Document the official Plugins Directory requirements: verified identity, Apps Management write access, public production MCP URL, domain verification, legal URLs, accurate annotations, five positive cases, three negative cases, regions, attestations, review, and publication.
- [ ] Identify the architectural gap: official direct-publishing distribution needs a hosted multi-tenant MCP and per-user credential model; the current local-first stdio MCP cannot be submitted as the production MCP URL.
- [ ] Recommend GitHub marketplace beta first, then a separate hosted-MCP submission project after beta validation.
