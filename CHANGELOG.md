# Changelog

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
