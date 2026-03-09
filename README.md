# AI Context Optimizer

> **Privacy & Security:** This extension runs entirely locally. It makes **zero network requests**, does not collect telemetry, does not persist any data outside the VS Code session, and does not access external APIs. File contents are read from the local filesystem via `vscode.workspace.fs` and, when analysis is requested (`/optimize`, `/compare`), are forwarded — truncated to a hard limit — exclusively to the VS Code Language Model API (`vscode.lm`), which routes to whichever model the user has configured. No data leaves the machine through this extension.

## What it does

AI Context Optimizer is a **VS Code Chat Participant** (`@context-optimizer`) that statically analyzes AI context files across 15+ tools — GitHub Copilot, Claude Code, Gemini, Cursor, Windsurf, Aider, Continue, Cline, Amazon Q, Tabnine, Cody, Augment, Sourcery, Devin, and SpecKit. It scans the workspace for instruction, rule, and configuration files that are auto-loaded by these tools, classifies each by **loading frequency** and **token cost** (HIGH / MEDIUM / LOW / FREE), and produces an audit report with line counts. For deeper analysis, it forwards the report and file contents (truncated) to the user's configured language model to generate specific, file-by-file optimization recommendations.

## The Problem

Every AI-powered coding session starts by loading context files (`copilot-instructions.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, etc.). If these files are bloated, duplicated, or poorly structured, you're paying extra tokens on **every single interaction** — before you even ask a question.

## Quick Start

> **1.** Open the Copilot Chat panel (`Ctrl+Shift+I` / `⌘⇧I`)
>
> **2.** Type `@context-optimizer` and press Enter
>
> **3.** The extension scans your workspace and returns an audit report instantly

### `/audit` — See What You're Spending

```
@context-optimizer /audit
```

Returns a full inventory of every AI context file in your workspace, classified by cost level with line counts. **Read-only** — nothing is changed.

### `/optimize` — Get a Fix Plan

```
@context-optimizer /optimize
```

Analyzes each HIGH-cost file and generates **specific recommendations**: which sections to extract into scoped `.instructions.md` files, what to deduplicate, and how to restructure for minimal auto-loaded tokens.

### `/compare` — Preview the Savings

```
@context-optimizer /compare
```

Shows a **before/after projection** with line counts and reduction percentages — without touching any file. Review the plan before committing to changes.

### Free-form Questions

```
@context-optimizer why is my CLAUDE.md so expensive?
@context-optimizer how can I reduce copilot-instructions to under 60 lines?
```

Ask anything about your context files and get tailored analysis.

## Supported Files

| Tool                 | Files Detected                                                           |
| -------------------- | ------------------------------------------------------------------------ |
| **GitHub Copilot**   | `copilot-instructions.md`, `.instructions.md`, `.agent.md`, `.prompt.md` |
| **Claude Code**      | `CLAUDE.md`, `AGENTS.md`, `MEMORY.md`, `hooks.json`                      |
| **Gemini**           | `GEMINI.md`, `settings.json`                                             |
| **Cursor**           | `.cursorrules`, `.cursor/rules/*.mdc`                                    |
| **Windsurf**         | `.windsurfrules`                                                         |
| **Aider**            | `.aider.conf.yml`, `.aiderignore`                                        |
| **Continue.dev**     | `.continuerules`, `.continue/config.json`, `.continue/rules/*.md`        |
| **Cline**            | `.clinerules`, `.cline/settings.json`, `.cline/rules/*.md`               |
| **Amazon Q**         | `.q/rules/*.md`                                                          |
| **Tabnine**          | `.tabnine.json`                                                          |
| **Sourcegraph Cody** | `.cody/cody.json`, `.cody/rules/*.md`                                    |
| **Augment**          | `.augment/config.json`, `.augment/rules/*.md`                            |
| **Sourcery**         | `.sourcery.yaml`                                                         |
| **Devin**            | `.devin/guidelines.md`, `.devin/rules/*.md`                              |
| **SpecKit**          | `constitution.md`, templates                                             |

## Cost Classification

| Level         | Meaning                  | Impact                              |
| ------------- | ------------------------ | ----------------------------------- |
| 🔴 **HIGH**   | Loaded every interaction | Tokens spent on every message       |
| 🟡 **MEDIUM** | Loaded conditionally     | Tokens spent in specific modes      |
| 🟢 **LOW**    | Scoped with `applyTo`    | Tokens spent only on matching files |
| ⚪ **FREE**   | On-demand only           | Zero cost until explicitly invoked  |

## Commands

| Command                        | What it does                                               |
| ------------------------------ | ---------------------------------------------------------- |
| `@context-optimizer`           | Free-form analysis — ask anything about your context files |
| `@context-optimizer /audit`    | Read-only audit report with line counts and cost levels    |
| `@context-optimizer /optimize` | Detailed file-by-file optimization plan                    |
| `@context-optimizer /compare`  | Before/after projection without applying changes           |

## Example Output

```
## AI Context Audit Report

| Metric                         | Lines |
|--------------------------------|-------|
| AUTO-LOADED (every session)    | 142   |
| Medium (conditional)           | 28    |
| Scoped (applyTo)               | 0     |
| Lazy (on-demand)               | 45    |
| Total                          | 215   |

⚠️ Auto-loaded context (142 lines) exceeds the ~60-80 line target.
```

## Requirements

- VS Code 1.100+
- GitHub Copilot Chat extension (for the chat participant API)

## License

[MIT](LICENSE)
