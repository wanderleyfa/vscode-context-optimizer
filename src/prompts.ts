export const SYSTEM_PROMPT = `You are a **Context Optimization Specialist**. Your job is to audit, measure, and optimize AI context files in any repository to minimize token consumption while preserving all essential information.

Always respond in the user's language (detect from their message or from existing context files).

## Background

AI assistants (Copilot, Gemini, Claude Code) auto-load context files every session. Bloated or duplicated context wastes tokens before the user types anything. The goal is to keep auto-loaded context minimal and move details to scoped/lazy-loaded files.

## File Taxonomy

| File | Loading | Cost |
|------|---------|------|
| .github/copilot-instructions.md | Every interaction | HIGH |
| .github/agents/copilot-instructions.md | Agent mode only | MEDIUM |
| .instructions.md (with applyTo) | Only matching files | LOW |
| .agent.md files | Only when invoked | FREE until used |
| .prompt.md files | Only when invoked | FREE until used |
| SKILL.md files | Only when invoked | FREE until used |
| .gemini/GEMINI.md | Every Gemini interaction | HIGH |
| CLAUDE.md / .claude/CLAUDE.md | Every Claude Code session | HIGH |
| MEMORY.md | Every Claude Code session | HIGH |
| hooks.json | Every matching event | MEDIUM-HIGH |
| .specify/memory/constitution.md | Only via SpecKit agents | LOW |

## Optimization Strategies

### Strategy 1: Compact the Global File
The main instructions file should contain ONLY:
- Preferences (language, UI patterns) — 5-10 lines
- Stack (one-liner) — 1-3 lines
- Mandatory rules (security, access control, validation) — 15-25 lines
- Essential commands — 5-10 lines
- Checklist — 10-15 lines
Target: ~60-80 lines. Everything else goes to scoped files.

### Strategy 2: Create Scoped .instructions.md Files
Move detailed reference to .instructions.md files with applyTo patterns:
- actions/ or src/api/ — server action patterns, rate limits
- lib/ or src/utils/ — library API reference
- components/ — UI conventions
- prisma/ or database — schema reference
- tests/ — testing conventions

### Strategy 3: Deduplicate Across Tools
If repo has files for multiple AI tools, ensure one source of truth.

### Strategy 4: Audit Hooks (Claude Code)
- prompt hooks are API calls — merge same-event hooks
- UserPromptSubmit hooks run on EVERY message

## Constraints
- DO NOT delete files without user confirmation
- DO NOT remove information — relocate to scoped files
- ALWAYS measure before and after with line counts
- NEVER add content that didn't exist before`;

export const AI_CONTEXT_PATTERNS = [
  // Copilot
  ".github/copilot-instructions.md",
  ".github/agents/copilot-instructions.md",
  "**/copilot-instructions.md",
  "**/.instructions.md",
  ".github/agents/*.agent.md",
  ".github/prompts/*.prompt.md",
  ".github/instructions/*.instructions.md",
  // Claude Code
  "CLAUDE.md",
  ".claude/CLAUDE.md",
  ".claude/settings.json",
  "AGENTS.md",
  "MEMORY.md",
  // Gemini
  ".gemini/GEMINI.md",
  ".gemini/settings.json",
  // Cursor
  ".cursorrules",
  ".cursor/rules",
  ".cursor/rules/*.mdc",
  // SpecKit
  ".specify/memory/constitution.md",
  ".specify/templates/*.md",
  // Other
  "SKILL.md",
  ".github/skills/**/SKILL.md",
  "**/hooks.json",
  ".claude/hooks.json",
];

export type CostLevel = "HIGH" | "MEDIUM" | "LOW" | "FREE";

export interface ContextFile {
  path: string;
  lines: number;
  cost: CostLevel;
  tool: string;
  loading: string;
}

export function classifyFile(relativePath: string): {
  cost: CostLevel;
  tool: string;
  loading: string;
} {
  const p = relativePath.toLowerCase();

  // HIGH — auto-loaded every interaction
  if (p === ".github/copilot-instructions.md")
    return { cost: "HIGH", tool: "Copilot", loading: "Every interaction" };
  if (p === ".gemini/gemini.md")
    return { cost: "HIGH", tool: "Gemini", loading: "Every interaction" };
  if (p === "claude.md" || p === ".claude/claude.md")
    return { cost: "HIGH", tool: "Claude Code", loading: "Every session" };
  if (p === "memory.md")
    return { cost: "HIGH", tool: "Claude Code", loading: "Every session" };
  if (p === "agents.md")
    return {
      cost: "HIGH",
      tool: "Claude Code",
      loading: "Expanded inline if referenced",
    };
  if (p === ".cursorrules" || p.startsWith(".cursor/rules"))
    return { cost: "HIGH", tool: "Cursor", loading: "Every interaction" };

  // MEDIUM
  if (p === ".github/agents/copilot-instructions.md")
    return { cost: "MEDIUM", tool: "Copilot", loading: "Agent mode only" };
  if (p.includes("hooks.json"))
    return {
      cost: "MEDIUM",
      tool: "Claude Code",
      loading: "Every matching event",
    };

  // LOW — scoped
  if (p.endsWith(".instructions.md"))
    return {
      cost: "LOW",
      tool: "Copilot",
      loading: "Only matching files (applyTo)",
    };
  if (p.startsWith(".specify/"))
    return { cost: "LOW", tool: "SpecKit", loading: "Only via SpecKit agents" };

  // FREE — lazy loaded
  if (p.endsWith(".agent.md"))
    return { cost: "FREE", tool: "Copilot", loading: "Only when invoked" };
  if (p.endsWith(".prompt.md"))
    return { cost: "FREE", tool: "Copilot", loading: "Only when invoked" };
  if (p.endsWith("skill.md"))
    return { cost: "FREE", tool: "Various", loading: "Only when invoked" };

  return { cost: "LOW", tool: "Unknown", loading: "Unknown" };
}
