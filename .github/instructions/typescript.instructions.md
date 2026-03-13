---
applyTo: "src/**/*.ts"
---

# TypeScript Conventions

- Use `import * as vscode` (namespaced); selective destructuring for other modules
- All async functions must accept `CancellationToken` and check `token?.isCancellationRequested`
- Use `Promise.all()` for parallel I/O — never sequential awaits in loops
- Stream responses via `stream.markdown()` — never buffer full output
- Value-based error handling with fallbacks — avoid try/catch unless truly needed
- No runtime dependencies — everything must use VS Code API or Node.js built-ins
- `camelCase` for variables/functions, `SCREAMING_SNAKE_CASE` for constants
- Export types with `export type` (not `export interface` re-exports)
