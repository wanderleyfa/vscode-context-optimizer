---
name: context-sync
description: Synchronize instructions across multiple AI tools (Copilot, Claude Code, Gemini, AGENTS.md) to eliminate duplication and maintain a single source of truth. Use when the user asks to sync context files or unify CLAUDE.md and copilot-instructions.md.
---

# Context Sync (`/context-sync`)

Synchronize AI context files across tools so your repository maintains a single source of truth (`AGENTS.md` / `.github/copilot-instructions.md`):

1. Invoke the `context-optimizer_sync` tool (`#contextSync`) with `confirm: false` to generate a cross-tool synchronization preview and unified diffs.
2. Show the delta table and diffs to the user and ask for explicit confirmation.
3. Once confirmed, invoke `context-optimizer_sync` (`#contextSync`) with `confirm: true` (or `context-optimizer_apply` with `confirm: true`) to write the synchronized files.
