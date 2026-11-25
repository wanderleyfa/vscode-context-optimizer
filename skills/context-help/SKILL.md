---
name: context-help
description: Show available AI Context Optimizer skills, tools, custom agent usage, Command Palette actions, and configuration settings. Use when the user asks for help with context-optimizer.
---

# Context Help (`/context-help`)

Present the quick reference for **AI Context Optimizer**:

| Skill | Tool Reference | Description |
|---|---|---|
| `/context-audit` | `#contextAudit` | Read-only audit report with line counts, token costs, similarity & lint checks |
| `/context-optimize` | `#contextAudit` | Detailed file-by-file optimization plan and extracted instructions |
| `/context-compare` | `#contextAudit` | Before/after token savings projection without modifying files |
| `/context-apply` | `#contextApply` | Preview unified diffs first, then apply after explicit confirmation |
| `/context-sync` | `#contextSync` | Synchronize instructions across Copilot, Claude, Gemini & `AGENTS.md` |
| `/context-init` | `#contextInit` | Scaffold `.github/copilot-instructions.md` from project metadata |
| `/context-help` | — | Show this reference table |

### Custom Agent
Select **Context Optimizer** from the Copilot Chat agent dropdown for an ongoing specialist persona.

### Editor Features & Command Palette (`⌘⇧P` / `Ctrl+Shift+P`)
- **Live Status Bar** — Shows auto-loaded line/token count in the bottom right status bar
- **Problems Diagnostics & CodeLens** — Flags missing `applyTo`, `SKILL.md` folder mismatches, broken file/script references, and oversized files directly in the editor
- `AI Context Optimizer: Show Audit Report`
- `AI Context Optimizer: Initialize Copilot Instructions`
- `AI Context Optimizer: Synchronize AI Context Files`

### Settings
- `contextOptimizer.autoLoadedLineThreshold` — Max recommended lines for auto-loaded context files (default: `80`)
- `contextOptimizer.maxFilesPerPattern` — Max files matched per scan pattern (default: `1000`)
- `contextOptimizer.excludeGlob` — Glob pattern excluded from scans
