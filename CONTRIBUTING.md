# Contributing to ContextQuill

Thanks for helping make low-effort, high-integrity professional publishing more accessible.

## Development flow

1. Fork the repository and create a focused branch. Maintainer-owned Codex branches use `codex/<short-change-name>`.
2. Make one coherent, reviewable change.
3. Run:

   ```text
   npm test
   node --check lib/core.mjs
   node --check mcp/server.mjs
   ```

4. Review the full diff for credentials, private customer context, and unintended disclosure.
5. Open a pull request with the user-visible outcome and validation evidence.
6. Maintainer changes follow the approval gate in `AGENTS.md`; external contributors do not need to reproduce the maintainer's private approval phrase.

## Good first contributions

- Improve onboarding or error messages without weakening safety gates.
- Add cross-platform secure credential-store support.
- Add importers for official analytics exports.
- Improve test coverage for a real, reproducible failure.
- Add work-agent setup examples that you have personally validated.

Before proposing a large architecture change, open an issue so the intended product outcome can be agreed first.

## Security

Never commit access tokens, client secrets, private LinkedIn data, or files from the local ContextQuill content store. See [PRIVACY.md](./PRIVACY.md) for the local data model.
