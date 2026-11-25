---
name: context-audit
description: Audit all AI context files in the workspace and report line counts, token costs, and content similarity (read-only). Use when the user asks to audit context, check token usage, or inspect AI instructions.
---

# Context Audit (`/context-audit`)

Run a read-only audit of all AI context files in the current workspace:

1. Invoke the `context-optimizer_audit` tool (`#contextAudit`) with `includeContents: false`.
2. Present the generated **AI Context Audit Report** (summary table, file inventory with cost icons, content similarity matrix, and recommendations) directly to the user in their language.
3. Do not modify any files during an audit. Suggest `/context-optimize`, `/context-compare`, or `/context-apply` as follow-up actions if auto-loaded lines exceed the threshold.
