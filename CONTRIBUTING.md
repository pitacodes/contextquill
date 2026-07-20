# Contributing to ContextQuill

ContextQuill uses a human-approved change workflow.

## Development flow

1. Create a branch named `codex/<short-change-name>`.
2. Make one coherent change.
3. Run:

   ```text
   npm test
   node --check lib/core.mjs
   node --check mcp/server.mjs
   ```

4. Review the full diff for credentials, private customer context, and unintended disclosure.
5. Obtain the repository owner's explicit approval before pushing or merging.
6. Merge through a pull request; do not push feature work directly to `main`.

## Security

Never commit access tokens, client secrets, private LinkedIn data, or files from the local ContextQuill content store. See [PRIVACY.md](./PRIVACY.md) for the local data model.
