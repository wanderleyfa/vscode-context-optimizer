---
name: context-compare
description: Show a before/after token and line-count projection for optimizing AI context files without modifying any workspace files. Use when the user wants to compare current vs. optimized context costs.
---

# Context Compare (`/context-compare`)

Provide a before/after projection of context optimization savings:

1. Invoke the `context-optimizer_audit` tool (`#contextAudit`) with `includeContents: true`.
2. Build a comparison table showing:
   - Current vs. projected lines and `~Tokens` per file and per cost tier (`HIGH`, `MEDIUM`, `LOW`, `FREE`).
   - Total auto-loaded token reduction percentage.
   - Proposed scoped `.instructions.md` files with their target `applyTo` globs and estimated line counts.
3. Do NOT write or modify any files.
