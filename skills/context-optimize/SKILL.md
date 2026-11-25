---
name: context-optimize
description: Audit AI context files and generate concrete, file-by-file optimization recommendations to reduce auto-loaded token consumption. Use when the user asks to optimize copilot-instructions, compact CLAUDE.md, or extract scoped instructions.
---

# Context Optimize (`/context-optimize`)

Generate a detailed optimization plan and ready-to-use file contents for bloated AI context files:

1. Invoke the `context-optimizer_audit` tool (`#contextAudit`) with `includeContents: true`.
2. For each HIGH-cost file exceeding the auto-loaded threshold (~80 lines by default):
   - Produce a compacted global file containing only core preferences, stack summary, mandatory rules, and essential commands.
   - Extract detailed domain sections into scoped `.github/instructions/<topic>.instructions.md` files with appropriate `applyTo` glob frontmatter.
3. If multiple HIGH-cost files have >40% similarity, deduplicate overlapping instructions.
4. Show projected before/after line and token counts for every modified or created file.
5. Offer to preview and apply the changes via `/context-apply` (`#contextApply`).
