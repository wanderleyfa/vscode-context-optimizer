---
name: context-init
description: Scaffold a concise, token-efficient .github/copilot-instructions.md file from project metadata (package.json, pyproject.toml, Cargo.toml, go.mod). Use when initializing AI instructions in a project.
---

# Context Init (`/context-init`)

Scaffold a starter `.github/copilot-instructions.md` from workspace metadata:

1. Invoke the `context-optimizer_init` tool (`#contextInit`).
   - Pass `writeIfMissing: false` by default to preview the generated file, or `writeIfMissing: true` if the user explicitly asked to create the file on disk.
2. Present the generated markdown and line count to the user.
