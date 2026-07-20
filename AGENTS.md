# ContextQuill Repository Rules

These instructions apply to every change in this repository.

## Product rules

- Keep all product UI, documentation, prompts, reports, and approval phrases in English.
- Never commit LinkedIn access tokens, OAuth secrets, member credentials, browser-session data, or private content-vault data.
- LinkedIn credentials belong only in macOS Keychain or process environment variables.
- Preserve the exact human-review gate for LinkedIn publishing. An edited post must lose approval and return to review.

## GitHub approval workflow

The initial private-repository bootstrap is authorized by the repository owner's request. For every later update:

1. Work on a branch named `codex/<short-change-name>`.
2. Implement and test the change locally.
3. Show the owner a concise diff summary, validation results, and the proposed branch or pull request.
4. Do not push, merge, or update `main` until the owner personally types `APPROVE GITHUB <branch-or-pr>`.
5. Do not infer approval from “continue,” silence, general praise, or an earlier authorization.
6. After exact approval, push the branch, open a pull request, squash-merge it into `main`, and report the resulting commit.

Any change after approval invalidates that approval and requires a fresh review.
