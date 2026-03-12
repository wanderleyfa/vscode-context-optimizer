import * as assert from "node:assert";
import { describe, it } from "node:test";
import { classifyFile, AI_CONTEXT_PATTERNS } from "../prompts";

describe("classifyFile", () => {
  const highCostFiles: [string, string][] = [
    [".github/copilot-instructions.md", "Copilot"],
    [".gemini/GEMINI.md", "Gemini"],
    ["CLAUDE.md", "Claude Code"],
    [".claude/CLAUDE.md", "Claude Code"],
    ["MEMORY.md", "Claude Code"],
    [".cursorrules", "Cursor"],
    [".windsurfrules", "Windsurf"],
    [".aider.conf.yml", "Aider"],
    [".clinerules", "Cline"],
    [".tabnine.json", "Tabnine"],
    [".sourcery.yaml", "Sourcery"],
  ];

  for (const [path, expectedTool] of highCostFiles) {
    it(`classifies ${path} as HIGH cost for ${expectedTool}`, () => {
      const result = classifyFile(path);
      assert.strictEqual(result.cost, "HIGH");
      assert.strictEqual(result.tool, expectedTool);
    });
  }

  it("classifies .instructions.md files as LOW cost", () => {
    const result = classifyFile(
      ".github/instructions/typescript.instructions.md",
    );
    assert.strictEqual(result.cost, "LOW");
    assert.strictEqual(result.tool, "Copilot");
  });

  it("classifies .agent.md files as FREE cost", () => {
    const result = classifyFile(".github/agents/optimizer.agent.md");
    assert.strictEqual(result.cost, "FREE");
    assert.strictEqual(result.tool, "Copilot");
  });

  it("classifies .prompt.md files as FREE cost", () => {
    const result = classifyFile(".github/prompts/test.prompt.md");
    assert.strictEqual(result.cost, "FREE");
    assert.strictEqual(result.tool, "Copilot");
  });

  it("classifies SKILL.md files as FREE cost", () => {
    const result = classifyFile(".github/skills/test/SKILL.md");
    assert.strictEqual(result.cost, "FREE");
  });

  it("classifies agent-mode copilot instructions as MEDIUM", () => {
    const result = classifyFile(".github/agents/copilot-instructions.md");
    assert.strictEqual(result.cost, "MEDIUM");
    assert.strictEqual(result.tool, "Copilot");
  });

  it("classifies hooks.json as MEDIUM", () => {
    const result = classifyFile(".claude/hooks.json");
    assert.strictEqual(result.cost, "MEDIUM");
    assert.strictEqual(result.tool, "Claude Code");
  });
});

describe("AI_CONTEXT_PATTERNS", () => {
  it("is a non-empty array of glob strings", () => {
    assert.ok(Array.isArray(AI_CONTEXT_PATTERNS));
    assert.ok(AI_CONTEXT_PATTERNS.length > 0);
    for (const pattern of AI_CONTEXT_PATTERNS) {
      assert.strictEqual(typeof pattern, "string");
    }
  });

  it("includes patterns for major AI tools", () => {
    const patternsStr = AI_CONTEXT_PATTERNS.join(" ");
    const expectedTools = [
      "copilot",
      "CLAUDE",
      "GEMINI",
      "cursorrules",
      "windsurfrules",
      "clinerules",
      "aider",
    ];
    for (const tool of expectedTools) {
      assert.ok(patternsStr.includes(tool), `Missing pattern for ${tool}`);
    }
  });

  it("has no duplicate patterns", () => {
    const unique = new Set(AI_CONTEXT_PATTERNS);
    assert.strictEqual(
      unique.size,
      AI_CONTEXT_PATTERNS.length,
      `Found ${AI_CONTEXT_PATTERNS.length - unique.size} duplicate pattern(s)`,
    );
  });
});

describe("classifyFile edge cases", () => {
  it("classifies unknown file as LOW with Unknown tool", () => {
    const result = classifyFile("random-file.txt");
    assert.strictEqual(result.cost, "LOW");
    assert.strictEqual(result.tool, "Unknown");
  });

  it("handles deeply nested paths", () => {
    const result = classifyFile(
      "some/deep/nested/.github/instructions/deep.instructions.md",
    );
    assert.strictEqual(result.cost, "LOW");
    assert.strictEqual(result.tool, "Copilot");
  });

  it("is case-insensitive for path matching", () => {
    const result = classifyFile(".gemini/GEMINI.md");
    assert.strictEqual(result.cost, "HIGH");
    assert.strictEqual(result.tool, "Gemini");
  });

  it("classifies all Amazon Q rules paths", () => {
    const result = classifyFile(".q/rules/coding-standards.md");
    assert.strictEqual(result.cost, "HIGH");
    assert.strictEqual(result.tool, "Amazon Q");
  });

  it("classifies Devin nested paths", () => {
    const result = classifyFile(".devin/rules/custom.md");
    assert.strictEqual(result.cost, "HIGH");
    assert.strictEqual(result.tool, "Devin");
  });

  it("classifies Augment config and rules", () => {
    const config = classifyFile(".augment/config.json");
    assert.strictEqual(config.cost, "HIGH");
    assert.strictEqual(config.tool, "Augment");

    const rules = classifyFile(".augment/rules/style.md");
    assert.strictEqual(rules.cost, "HIGH");
  });
});
