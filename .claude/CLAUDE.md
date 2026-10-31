# Ecom native development

Ecom is an independently maintained desktop browser. The native source starts from the fixed baseline recorded in `ecom/source-baseline.json`. Root `AGENTS.md` defines product requirements and authorization boundaries.

Use the repository root for source changes. The managed worktree under `.brave-build/src/brave` supplies the layout expected by Chromium build tooling. Keep comments, commit messages and PR descriptions concise.

Read only relevant documentation from `docs/README.md` and `docs/best_practices.md` before native implementation. Preserve Chromium layer boundaries and validate platform behavior before claiming support.

Do not delete caches, build output directories, or machine state outside the repository worktree without explicit authorization. Preserve user edits and keep recoverable file backups where required by project rules.
