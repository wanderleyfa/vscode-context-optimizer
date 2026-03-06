# AI Context Optimizer

VS Code extension that audits and optimizes AI context files to reduce token consumption.

## Features

- `@context-optimizer` — Chat participant available in all VS Code windows
- Scans for Copilot, Claude Code, Gemini, Cursor, and SpecKit context files
- Classifies each file by cost (HIGH/MEDIUM/LOW/FREE)
- Provides specific optimization recommendations

## Commands

In the Copilot Chat, use:

- `@context-optimizer` — Free-form analysis
- `@context-optimizer /audit` — Read-only audit report
- `@context-optimizer /optimize` — Detailed optimization plan
- `@context-optimizer /compare` — Before/after projection

## Install from source

```bash
npm install
npm run compile
npx @vscode/vsce package
code --install-extension context-optimizer-0.1.0.vsix
```
