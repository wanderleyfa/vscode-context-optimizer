---
name: context-apply
description: Preview unified diffs for optimized AI context files and apply them to the workspace only after explicit confirmation. Use when the user asks to apply context optimizations or write compacted instruction files.
---

# Context Apply (`/context-apply`)

Safely preview and apply optimized AI context files in two steps:

1. **Step 1 — Preview (`confirm: false`)**:
   - If you haven't audited the workspace yet, call `context-optimizer_audit` (`#contextAudit`) with `includeContents: true`.
   - Construct the full optimized contents for each updated or newly extracted file (up to 8 files, keeping auto-loaded context under the line threshold and preserving all rules).
   - Call `context-optimizer_apply` (`#contextApply`) with `summary`, `files`, and `confirm: false`.
   - Display the returned delta table (`ΔLines`, `ΔTokens`) and unified diffs to the user, and ask for explicit confirmation.
2. **Step 2 — Apply (`confirm: true`)**:
   - Once the user confirms, call `context-optimizer_apply` (`#contextApply`) with `confirm: true` to write the files with hash conflict verification.
