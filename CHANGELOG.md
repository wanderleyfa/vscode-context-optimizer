# Changelog

## [0.4.0] - 2026-11-25

### Added

- **Copilot Harness Support (Chat Participant Replacement)**:
  - Contributed **Language Model Tools** (`contributes.languageModelTools`):
    - `context-optimizer_audit` (`#contextAudit`) — scans workspace AI context files, estimates tokens, detects similarity & lint issues, and optionally returns HIGH/MEDIUM contents
    - `context-optimizer_init` (`#contextInit`) — scaffolds `.github/copilot-instructions.md` from project metadata
    - `context-optimizer_apply` (`#contextApply`) — two-step diff preview and confirmed file write with SHA-256 conflict detection
    - `context-optimizer_sync` (`#contextSync`) — synchronizes instructions across `AGENTS.md`, `.github/copilot-instructions.md`, `CLAUDE.md` (`@AGENTS.md` pointer), and `.gemini/GEMINI.md`
  - Contributed **Custom Agent** (`contributes.chatAgents` -> `agents/context-optimizer.agent.md`) for an ongoing Context Optimizer specialist role in Copilot Chat
  - Contributed **Agent Skills** (`contributes.chatSkills` -> `skills/*/SKILL.md`) for `/context-audit`, `/context-optimize`, `/context-compare`, `/context-apply`, `/context-sync`, `/context-init`, and `/context-help`
- **Live Editor Integrations (Outside Chat)**:
  - **Status Bar Indicator** — displays real-time auto-loaded line and token metrics with warning highlight when exceeding threshold
  - **VS Code Problems Diagnostics (`src/linter.ts`)** — detects missing `applyTo` frontmatter in `.instructions.md`, `SKILL.md` folder name mismatches, broken file path references, non-existent npm scripts, and cross-file duplicate headings
  - **CodeLens Provider** — displays inline token cost, tool name, and loading behavior at the top of every AI context file
  - **Command Palette Commands** — `AI Context Optimizer: Show Audit Report`, `AI Context Optimizer: Initialize Copilot Instructions`, and `AI Context Optimizer: Synchronize AI Context Files`
- **Expanded AI Tool & Smart Classification Support**:
  - Smart frontmatter parsing for Cursor `.cursor/rules/*.mdc` (`alwaysApply: false` + `globs` classified as `LOW` instead of `HIGH`)
  - Added support for **Roo Code** (`.roorules`, `.roo/rules/*.md`), **Kilo Code** (`.kilocode/rules/*.md`), **Windsurf rules** (`.windsurf/rules/*.md`), and cross-agent skill directories (`.agents/skills/**/SKILL.md`, `.claude/skills/**/SKILL.md`)
- `/apply` command with two-step flow: preview diffs first, then apply only after explicit confirmation (`/apply confirm`)
- New apply utilities (`src/apply.ts`) and diff preview engine (`src/diff.ts`)
- New tests for apply plan parsing, confirmation flow, and diff generation
- Restored GitHub Actions CI workflow (`.github/workflows/ci.yml`) for lint + test + compile on Node 20/22
- Scanner scalability settings:
  - `contextOptimizer.maxFilesPerPattern`
  - `contextOptimizer.excludeGlob`

### Changed

- Retained legacy `@context-optimizer` Chat Participant for backward compatibility with the Local harness while supporting the new Copilot harness natively
- Token estimation now uses content-aware heuristic instead of fixed tokens-per-line multiplier
- `/help` and README command/settings docs updated to include skills, `#context*` tool references, `/apply`, and scan scaling settings

## [0.3.0] - 2025-06-23

### Added

- `/init` command — scaffolds `copilot-instructions.md` from project metadata (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`)
- `/help` command — shows all available commands and settings in a quick-reference table
- Content similarity detection — flags HIGH-cost files with >40% overlap using Dice coefficient
- Clickable file anchors in audit report — open files directly from the chat
- Token estimation column (~Tokens) in audit summary and inventory tables
- Configurable threshold setting `contextOptimizer.autoLoadedLineThreshold`
- Follow-up suggestions after `/audit` output
- Conversation history support (last 3 turns) for follow-up questions
- Tests for `similarity`, `findDuplicates`, `buildAuditReport`, `estimateTokens`
- ESLint configuration with TypeScript support
- GitHub Actions CI (Node 20/22 matrix)

### Changed

- Default `@context-optimizer` invocation now generates optimized files directly instead of just recommendations
- Extracted `buildAuditReport`, `estimateTokens`, `similarity`, `findDuplicates` into `src/report.ts` for testability
- Cleaned up dead re-exports from `scanner.ts`
- Updated README with new features, settings, and updated example output (EN/PT-BR/ES)

### Fixed

- Removed duplicate `.claude/hooks.json` glob pattern
- Graceful error handling with CancellationError awareness
- No-files-found message now shows helpful guidance

## [0.2.0] - 2026-03-12

### Added

- `/help` command with usage reference
- Token estimation (~tokens column) in audit reports
- Follow-up suggestions after `/audit` (try `/optimize` or `/compare`)
- Conversation history support — follow-up questions retain context
- Configurable threshold: `contextOptimizer.autoLoadedLineThreshold` setting
- Error handling — graceful recovery with helpful messages
- `.vscodeignore` — excludes marketing/doc files from VSIX package
- ESLint configuration with TypeScript support
- CI pipeline (GitHub Actions) for build + test on Node 20/22
- Scanner tests (`buildAuditReport`, `estimateTokens`)
- Edge case tests for `classifyFile` (unknown files, deep paths, case sensitivity)
- Duplicate pattern detection test for `AI_CONTEXT_PATTERNS`
- Gallery banner for VS Code Marketplace

### Fixed

- Removed duplicate `.claude/hooks.json` glob pattern
- Default invocation now generates optimized files directly (not just recommendations)

## [0.1.2] - 2026-03-08

### Fixed

- Minor metadata updates

## [0.1.1] - 2026-03-07

### Fixed

- Icon path resolution

## [0.1.0] - 2026-03-06

### Added

- Initial release
- `@context-optimizer` chat participant with `/audit`, `/optimize`, and `/compare` commands
- Auto-discovery of AI context files (Copilot, Claude Code, Gemini, Cursor, SpecKit)
- File classification by cost level (HIGH / MEDIUM / LOW / FREE)
- Token consumption audit report with line counts
- Optimization recommendations for bloated context files
