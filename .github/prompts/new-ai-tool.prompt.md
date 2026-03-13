---
description: "Add support for a new AI tool (e.g., Windsurf, Devin, Tabnine). Adds glob patterns, file classification, and system prompt taxonomy entry."
agent: "agent"
argument-hint: "Tool name and its context file paths"
---

Add support for a new AI tool to the extension. For the given tool:

1. **`src/prompts.ts` — `AI_CONTEXT_PATTERNS`**: Add glob patterns for the tool's context files (group with a comment `// ToolName`)
2. **`src/prompts.ts` — `classifyFile()`**: Add classification rules with correct cost level, tool name, and loading description:
   - HIGH = auto-loaded every interaction/session
   - MEDIUM = conditional (agent mode, hooks, settings)
   - LOW = scoped / filtered
   - FREE = only when invoked
3. **`src/prompts.ts` — `SYSTEM_PROMPT` File Taxonomy table**: Add a row for each new file type
4. Maintain alphabetical order within each cost level group
5. Follow existing code patterns — check neighboring entries for style

Reference the existing patterns in [src/prompts.ts](src/prompts.ts) for examples.
