import * as assert from "node:assert";
import { describe, it } from "node:test";
import {
  buildCrossToolSyncPlan,
  buildQuickFixContent,
  countMcpServers,
  extractReferencedPaths,
  extractReferencedScripts,
  findDuplicateHeadings,
  lintContextFiles,
  parseFrontmatter,
} from "../linter";
import { classifyFile, type ContextFile } from "../prompts";

function makeFile(
  overrides: Partial<ContextFile> & { path: string },
): ContextFile {
  return {
    lines: 10,
    content: "# Title\nSome rules",
    cost: "HIGH",
    tool: "Copilot",
    loading: "Every interaction",
    ...overrides,
  };
}

describe("parseFrontmatter", () => {
  it("parses YAML frontmatter key-value pairs and booleans", () => {
    const content = [
      "---",
      'name: context-audit',
      'description: "Audit AI files"',
      "alwaysApply: true",
      'globs: "**/*.ts"',
      "---",
      "# Body",
    ].join("\n");

    const fm = parseFrontmatter(content);
    assert.ok(fm);
    assert.strictEqual(fm?.fields.name, "context-audit");
    assert.strictEqual(fm?.fields.description, "Audit AI files");
    assert.strictEqual(fm?.fields.alwaysApply, "true");
    assert.strictEqual(fm?.fields.globs, "**/*.ts");
  });

  it("returns undefined when no valid frontmatter block exists", () => {
    assert.strictEqual(parseFrontmatter("# No frontmatter"), undefined);
  });
});

describe("classifyFile smart content awareness", () => {
  it("classifies .cursor/rules/*.mdc with globs and alwaysApply: false as LOW cost", () => {
    const scopedMdc = [
      "---",
      "description: TypeScript rules",
      "globs: src/**/*.ts",
      "alwaysApply: false",
      "---",
      "# Cursor TS Rules",
    ].join("\n");

    const res = classifyFile(".cursor/rules/ts.mdc", scopedMdc);
    assert.strictEqual(res.cost, "LOW");
    assert.strictEqual(res.tool, "Cursor");
  });

  it("classifies .cursor/rules/*.mdc with alwaysApply: true as HIGH cost", () => {
    const globalMdc = [
      "---",
      "description: Global rules",
      "alwaysApply: true",
      "---",
      "# Cursor Global Rules",
    ].join("\n");

    const res = classifyFile(".cursor/rules/global.mdc", globalMdc);
    assert.strictEqual(res.cost, "HIGH");
    assert.strictEqual(res.tool, "Cursor");
  });

  it("classifies Roo Code, Kilo Code, Windsurf rules and .agents/.claude skills", () => {
    assert.strictEqual(classifyFile(".roo/rules/style.md").tool, "Roo Code");
    assert.strictEqual(classifyFile(".roo/rules/style.md").cost, "HIGH");
    assert.strictEqual(classifyFile(".roorules").tool, "Roo Code");
    assert.strictEqual(
      classifyFile(".kilocode/rules/arch.md").tool,
      "Kilo Code",
    );
    assert.strictEqual(
      classifyFile(".windsurf/rules/ui.md").tool,
      "Windsurf",
    );
    assert.strictEqual(
      classifyFile(".agents/skills/my-skill/SKILL.md").cost,
      "FREE",
    );
    assert.strictEqual(
      classifyFile(".claude/skills/my-skill/SKILL.md").cost,
      "FREE",
    );
  });
});

describe("extractReferencedPaths and extractReferencedScripts", () => {
  it("extracts relative file paths and npm scripts from markdown", () => {
    const md = [
      "Check `src/extension.ts` and [scanner](src/scanner.ts).",
      "Run `npm run compile` or `npm run missing-script` before committing.",
    ].join("\n");

    const paths = extractReferencedPaths(md);
    assert.ok(paths.includes("src/extension.ts"));
    assert.ok(paths.includes("src/scanner.ts"));

    const scripts = extractReferencedScripts(md);
    assert.ok(scripts.includes("compile"));
    assert.ok(scripts.includes("missing-script"));
  });
});

describe("findDuplicateHeadings", () => {
  it("detects identical level-2/3 headings across multiple HIGH-cost files", () => {
    const files: ContextFile[] = [
      makeFile({
        path: ".github/copilot-instructions.md",
        content: "# Main\n## Code Conventions\nUse strict.\n## Commands\nnpm test",
      }),
      makeFile({
        path: "CLAUDE.md",
        tool: "Claude Code",
        content: "# Claude\n## Code Conventions\nUse strict.\n## Other\nInfo",
      }),
    ];

    const dupes = findDuplicateHeadings(files);
    assert.strictEqual(dupes.length, 1);
    assert.strictEqual(dupes[0].heading, "Code Conventions");
    assert.deepStrictEqual(dupes[0].files, [
      ".github/copilot-instructions.md",
      "CLAUDE.md",
    ]);
  });
});

describe("lintContextFiles", () => {
  it("flags oversized HIGH files, missing applyTo, mismatched skill names, and stale refs", () => {
    const files: ContextFile[] = [
      makeFile({
        path: ".github/copilot-instructions.md",
        lines: 120,
        content:
          "# Rules\nSee `src/non-existent.ts` and run `npm run ghost-script`.\n" +
          "line\n".repeat(118),
        cost: "HIGH",
      }),
      makeFile({
        path: ".github/instructions/api.instructions.md",
        lines: 15,
        content: "# Missing applyTo frontmatter",
        cost: "LOW",
      }),
      makeFile({
        path: "skills/my-skill/SKILL.md",
        lines: 12,
        content: "---\nname: wrong-name\ndescription: test\n---\n# Skill",
        cost: "FREE",
      }),
    ];

    const issues = lintContextFiles(files, {
      threshold: 80,
      existingPaths: new Set(["src/extension.ts"]),
      availableScripts: new Set(["compile", "test"]),
    });

    assert.ok(
      issues.some(
        (i) =>
          i.file === ".github/copilot-instructions.md" &&
          i.code === "THRESHOLD_EXCEEDED",
      ),
    );
    assert.ok(
      issues.some(
        (i) =>
          i.file === ".github/copilot-instructions.md" &&
          i.code === "STALE_PATH" &&
          i.message.includes("src/non-existent.ts"),
      ),
    );
    assert.ok(
      issues.some(
        (i) =>
          i.file === ".github/copilot-instructions.md" &&
          i.code === "STALE_SCRIPT" &&
          i.message.includes("ghost-script"),
      ),
    );
    assert.ok(
      issues.some(
        (i) =>
          i.file === ".github/instructions/api.instructions.md" &&
          i.code === "MISSING_APPLY_TO",
      ),
    );
    assert.ok(
      issues.some(
        (i) =>
          i.file === "skills/my-skill/SKILL.md" &&
          i.code === "SKILL_NAME_MISMATCH",
      ),
    );
  });
});

describe("buildCrossToolSyncPlan", () => {
  it("builds a single-source-of-truth sync plan using AGENTS.md or primary instructions", () => {
    const files: ContextFile[] = [
      makeFile({
        path: ".github/copilot-instructions.md",
        lines: 25,
        content: "# Project Rules\n- Always test\n- Keep concise",
        cost: "HIGH",
      }),
      makeFile({
        path: "CLAUDE.md",
        lines: 30,
        content: "# Old Claude Rules\n- Outdated",
        cost: "HIGH",
        tool: "Claude Code",
      }),
    ];

    const plan = buildCrossToolSyncPlan(files);
    assert.strictEqual(plan.sourcePath, ".github/copilot-instructions.md");
    assert.ok(plan.files.some((f) => f.path === "AGENTS.md"));
    assert.ok(plan.files.some((f) => f.path === "CLAUDE.md"));
  });
});

describe("buildQuickFixContent", () => {
  it("adds applyTo frontmatter when MISSING_APPLY_TO is fixed", () => {
    const fixedWithoutFm = buildQuickFixContent(
      ".github/instructions/api.instructions.md",
      "# API Rules\nUse REST.",
      "MISSING_APPLY_TO",
    );
    assert.ok(fixedWithoutFm?.startsWith('---\napplyTo: "**/*"\n---\n'));
    assert.ok(fixedWithoutFm?.includes("# API Rules"));

    const fixedWithFm = buildQuickFixContent(
      ".github/instructions/api.instructions.md",
      "---\ndescription: API\n---\n# API Rules",
      "MISSING_APPLY_TO",
    );
    assert.ok(fixedWithFm?.includes('applyTo: "**/*"'));
    assert.ok(fixedWithFm?.includes("description: API"));
  });

  it("fixes SKILL_NAME_MISMATCH to match parent folder name", () => {
    const fixed = buildQuickFixContent(
      "skills/context-audit/SKILL.md",
      "---\nname: wrong-name\ndescription: Audit files\n---\n# Skill",
      "SKILL_NAME_MISMATCH",
    );
    assert.ok(fixed?.includes("name: context-audit"));
    assert.ok(!fixed?.includes("wrong-name"));
  });

  it("adds missing SKILL.md frontmatter or description", () => {
    const fixedFm = buildQuickFixContent(
      "skills/context-sync/SKILL.md",
      "# Sync Skill",
      "MISSING_FRONTMATTER",
    );
    assert.ok(fixedFm?.includes("name: context-sync"));
    assert.ok(fixedFm?.includes("description:"));

    const fixedDesc = buildQuickFixContent(
      "skills/context-sync/SKILL.md",
      "---\nname: context-sync\n---\n# Sync Skill",
      "MISSING_DESCRIPTION",
    );
    assert.ok(fixedDesc?.includes("description:"));
  });
});

describe("countMcpServers and MCP auditing", () => {
  it("counts configured MCP servers in .vscode/mcp.json and .cursor/mcp.json", () => {
    const vscodeMcp = JSON.stringify({
      servers: {
        github: { command: "npx" },
        postgres: { command: "npx" },
        playwright: { command: "npx" },
      },
    });
    assert.strictEqual(countMcpServers(vscodeMcp), 3);

    const cursorMcp = JSON.stringify({
      mcpServers: {
        s1: {},
        s2: {},
        s3: {},
        s4: {},
        s5: {},
        s6: {},
      },
    });
    assert.strictEqual(countMcpServers(cursorMcp), 6);
  });

  it("classifies MCP configuration files and flags excessive MCP servers (>5)", () => {
    const mcpClassification = classifyFile(".vscode/mcp.json");
    assert.strictEqual(mcpClassification.cost, "MEDIUM");
    assert.strictEqual(mcpClassification.tool, "MCP");

    const heavyMcpContent = JSON.stringify({
      mcpServers: {
        a: {},
        b: {},
        c: {},
        d: {},
        e: {},
        f: {},
      },
    });
    const issues = lintContextFiles([
      makeFile({
        path: ".vscode/mcp.json",
        lines: 20,
        content: heavyMcpContent,
        cost: "MEDIUM",
        tool: "MCP",
      }),
    ]);

    assert.ok(
      issues.some(
        (i) => i.file === ".vscode/mcp.json" && i.code === "TOO_MANY_MCP_SERVERS",
      ),
    );
  });
});

