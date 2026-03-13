# Copilot Instructions

## Project

VS Code extension "AI Context Optimizer" — audits and optimizes AI context files to reduce token consumption. Implements a Chat Participant (`@context-optimizer`) with `/audit`, `/optimize`, and `/compare` commands.

## Stack

- TypeScript (strict mode), Node.js, VS Code Extension API
- esbuild for bundling (CommonJS output to `dist/`)
- No runtime dependencies — dev only: `@types/vscode`, `typescript`, `esbuild`, `@vscode/vsce`

## Architecture

Three source files with clear separation:

- `src/extension.ts` — Entry point, Chat Participant handler, LM integration
- `src/scanner.ts` — File discovery via glob patterns, audit report generation
- `src/prompts.ts` — System prompt, `AI_CONTEXT_PATTERNS`, file classification by cost level

## Code Conventions

- `import * as vscode` (namespaced), selective destructuring for other modules
- `async/await` with `CancellationToken` support on all long-running operations
- `Promise.all()` for parallel file discovery and reading
- `camelCase` for variables/functions, `SCREAMING_SNAKE_CASE` for constants
- Value-based error handling with fallbacks (not try/catch)
- Stream responses via `stream.markdown()` — never buffer full output

## Commands

- `npm run compile` — Build project
- `npm run watch` — Build in watch mode
- `npm test` — Run unit tests
- `npm run package` — Package VSIX

## Rules

1. Always ask before making breaking changes
2. Follow existing code patterns — check the source files before proposing changes
3. Keep the extension dependency-free (no runtime deps)
4. Respect `CancellationToken` in any new async operation
5. New AI tool patterns go in `AI_CONTEXT_PATTERNS` array in `prompts.ts`
