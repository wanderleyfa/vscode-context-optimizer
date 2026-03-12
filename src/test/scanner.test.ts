import * as assert from "node:assert";
import { describe, it } from "node:test";
import {
  buildAuditReport,
  estimateTokens,
  similarity,
  findDuplicates,
  getModeInstruction,
} from "../report";
import type { ContextFile } from "../prompts";

function makeFile(
  overrides: Partial<ContextFile> & { path: string },
): ContextFile {
  return {
    lines: 10,
    content: "x\n".repeat(10),
    cost: "HIGH",
    tool: "Copilot",
    loading: "Every interaction",
    ...overrides,
  };
}

describe("estimateTokens", () => {
  it("returns ~30 tokens per line", () => {
    assert.strictEqual(estimateTokens(1), 30);
    assert.strictEqual(estimateTokens(100), 3000);
    assert.strictEqual(estimateTokens(0), 0);
  });
});

describe("buildAuditReport", () => {
  it("returns markdown string with summary table", () => {
    const files: ContextFile[] = [
      makeFile({ path: ".github/copilot-instructions.md", lines: 30 }),
    ];
    const report = buildAuditReport(files);
    assert.ok(report.includes("## AI Context Audit Report"));
    assert.ok(report.includes("AUTO-LOADED"));
    assert.ok(report.includes("30"));
  });

  it("includes token estimates in the report", () => {
    const files: ContextFile[] = [
      makeFile({ path: ".github/copilot-instructions.md", lines: 100 }),
    ];
    const report = buildAuditReport(files);
    assert.ok(report.includes("~Tokens"));
    assert.ok(report.includes("3,000") || report.includes("3000"));
  });

  it("shows well-optimized message when under threshold", () => {
    const files: ContextFile[] = [
      makeFile({ path: ".github/copilot-instructions.md", lines: 40 }),
    ];
    const report = buildAuditReport(files, 80);
    assert.ok(report.includes("well-optimized"));
  });

  it("shows warning when auto-loaded exceeds threshold", () => {
    const files: ContextFile[] = [
      makeFile({ path: ".github/copilot-instructions.md", lines: 120 }),
    ];
    const report = buildAuditReport(files, 80);
    assert.ok(report.includes("Recommendations"));
    assert.ok(report.includes("Compact global file"));
  });

  it("suggests deduplication when multiple HIGH files exist", () => {
    const files: ContextFile[] = [
      makeFile({ path: ".github/copilot-instructions.md", lines: 50 }),
      makeFile({
        path: "CLAUDE.md",
        lines: 50,
        tool: "Claude Code",
        loading: "Every session",
      }),
    ];
    const report = buildAuditReport(files, 80);
    assert.ok(report.includes("Deduplicate"));
    assert.ok(report.includes("2 HIGH-cost files"));
  });

  it("respects custom threshold", () => {
    const files: ContextFile[] = [
      makeFile({ path: ".github/copilot-instructions.md", lines: 50 }),
    ];
    const underDefault = buildAuditReport(files, 80);
    assert.ok(underDefault.includes("well-optimized"));

    const overCustom = buildAuditReport(files, 40);
    assert.ok(overCustom.includes("Recommendations"));
  });

  it("handles mixed cost levels in inventory", () => {
    const files: ContextFile[] = [
      makeFile({ path: ".github/copilot-instructions.md", cost: "HIGH" }),
      makeFile({
        path: ".github/agents/copilot-instructions.md",
        cost: "MEDIUM",
        loading: "Agent mode only",
      }),
      makeFile({
        path: "test.instructions.md",
        cost: "LOW",
        loading: "Only matching files",
      }),
      makeFile({
        path: "test.prompt.md",
        cost: "FREE",
        loading: "Only when invoked",
      }),
    ];
    const report = buildAuditReport(files);
    assert.ok(report.includes("🔴"));
    assert.ok(report.includes("🟡"));
    assert.ok(report.includes("🟢"));
    assert.ok(report.includes("⚪"));
  });

  it("handles empty file list", () => {
    const report = buildAuditReport([]);
    assert.ok(report.includes("## AI Context Audit Report"));
    assert.ok(report.includes("well-optimized"));
  });
});

describe("similarity", () => {
  it("returns 1 for identical strings", () => {
    assert.strictEqual(similarity("hello world", "hello world"), 1);
  });

  it("returns 0 for completely different strings", () => {
    const score = similarity("aaaa", "zzzz");
    assert.ok(score < 0.1);
  });

  it("returns high score for similar content", () => {
    const a = "Use TypeScript strict mode. Follow camelCase naming.";
    const b = "Use TypeScript strict mode. Follow camelCase naming convention.";
    assert.ok(similarity(a, b) > 0.8);
  });

  it("is case-insensitive", () => {
    assert.strictEqual(similarity("Hello World", "hello world"), 1);
  });

  it("handles empty strings", () => {
    assert.strictEqual(similarity("", ""), 1);
    assert.strictEqual(similarity("abc", ""), 0);
  });
});

describe("findDuplicates", () => {
  it("finds duplicated HIGH-cost files", () => {
    const files: ContextFile[] = [
      makeFile({
        path: ".github/copilot-instructions.md",
        content: "Use TypeScript. Follow strict mode. Use camelCase naming.",
      }),
      makeFile({
        path: "CLAUDE.md",
        tool: "Claude Code",
        content: "Use TypeScript. Follow strict mode. Use camelCase naming.",
      }),
    ];
    const dupes = findDuplicates(files);
    assert.strictEqual(dupes.length, 1);
    assert.strictEqual(dupes[0].percent, 100);
  });

  it("ignores LOW/FREE cost files", () => {
    const files: ContextFile[] = [
      makeFile({
        path: "a.instructions.md",
        cost: "LOW",
        content: "same content here",
      }),
      makeFile({
        path: "b.instructions.md",
        cost: "LOW",
        content: "same content here",
      }),
    ];
    assert.strictEqual(findDuplicates(files).length, 0);
  });

  it("returns empty array when no duplicates", () => {
    const files: ContextFile[] = [
      makeFile({ path: "CLAUDE.md", content: "aaaa bbbb cccc dddd" }),
      makeFile({ path: ".cursorrules", content: "xxxx yyyy zzzz wwww" }),
    ];
    assert.strictEqual(findDuplicates(files).length, 0);
  });
});

describe("getModeInstruction", () => {
  it("returns optimize instruction for /optimize command", () => {
    const result = getModeInstruction("optimize", "", 80);
    assert.ok(result.includes("SPECIFIC file-by-file"));
    assert.ok(result.includes("80"));
  });

  it("returns compare instruction for /compare command", () => {
    const result = getModeInstruction("compare", "", 100);
    assert.ok(result.includes("before/after comparison"));
    assert.ok(result.includes("100"));
  });

  it("returns user prompt for default command when provided", () => {
    const result = getModeInstruction(undefined, "my custom question", 80);
    assert.strictEqual(result, "my custom question");
  });

  it("returns generation instruction when no command or prompt", () => {
    const result = getModeInstruction(undefined, "", 80);
    assert.ok(result.includes("GENERATE the optimized file contents"));
    assert.ok(result.includes("80"));
  });

  it("respects custom threshold in optimize mode", () => {
    const result = getModeInstruction("optimize", "", 50);
    assert.ok(result.includes("50"));
    assert.ok(!result.includes("80"));
  });
});
