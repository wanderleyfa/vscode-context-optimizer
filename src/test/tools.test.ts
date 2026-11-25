import * as assert from "node:assert";
import { describe, it } from "node:test";
import type { ContextFile } from "../prompts";
import {
  TOOL_NAMES,
  buildApplyPreviewReport,
  formatAuditToolPayload,
  generateInitInstructions,
} from "../tools";

function makeFile(
  overrides: Partial<ContextFile> & { path: string },
): ContextFile {
  return {
    lines: 10,
    content: "# Sample\nRule 1\nRule 2",
    cost: "HIGH",
    tool: "Copilot",
    loading: "Every interaction",
    ...overrides,
  };
}

describe("TOOL_NAMES", () => {
  it("defines stable tool identifiers matching package.json", () => {
    assert.strictEqual(TOOL_NAMES.AUDIT, "context-optimizer_audit");
    assert.strictEqual(TOOL_NAMES.INIT, "context-optimizer_init");
    assert.strictEqual(TOOL_NAMES.APPLY, "context-optimizer_apply");
    assert.strictEqual(TOOL_NAMES.SYNC, "context-optimizer_sync");
  });
});

describe("formatAuditToolPayload", () => {
  it("returns empty-workspace guidance when no context files exist", () => {
    const output = formatAuditToolPayload([], 80, true);
    assert.ok(output.includes("No AI context files found"));
  });

  it("includes audit report and high/medium file contents when requested", () => {
    const files: ContextFile[] = [
      makeFile({
        path: ".github/copilot-instructions.md",
        lines: 12,
        content: "# Global Rules\nAlways test first.",
        cost: "HIGH",
      }),
      makeFile({
        path: ".github/instructions/ts.instructions.md",
        lines: 8,
        content: "# TS Scoped Rules",
        cost: "LOW",
      }),
    ];

    const withContents = formatAuditToolPayload(files, 80, true);
    assert.ok(withContents.includes("## AI Context Audit Report"));
    assert.ok(withContents.includes("Always test first."));
    assert.ok(!withContents.includes("# TS Scoped Rules"));

    const withoutContents = formatAuditToolPayload(files, 80, false);
    assert.ok(withoutContents.includes("## AI Context Audit Report"));
    assert.ok(!withoutContents.includes("Always test first."));
  });
});

describe("generateInitInstructions", () => {
  it("detects stack and essential scripts from package.json metadata", () => {
    const md = generateInitInstructions({
      workspaceName: "my-app",
      packageJson: {
        displayName: "My Awesome App",
        description: "Fast web service",
        dependencies: { next: "^15.0.0", react: "^19.0.0" },
        devDependencies: { typescript: "^5.7.0", tailwindcss: "^4.0.0" },
        scripts: {
          dev: "next dev",
          build: "next build",
          test: "node --test",
          lint: "eslint .",
          custom: "echo ignore",
        },
      },
    });

    assert.ok(md.includes("My Awesome App — Fast web service"));
    assert.ok(md.includes("React, Next.js, TypeScript, Tailwind CSS"));
    assert.ok(md.includes("`npm run dev`"));
    assert.ok(md.includes("`npm run build`"));
    assert.ok(md.includes("`npm run test`"));
    assert.ok(md.includes("`npm run lint`"));
    assert.ok(!md.includes("custom"));
  });

  it("falls back to Python, Rust, Go or Unknown when package.json is absent", () => {
    const py = generateInitInstructions({
      workspaceName: "py-service",
      hasPyprojectToml: true,
    });
    assert.ok(py.includes("## Stack\nPython"));

    const rs = generateInitInstructions({
      workspaceName: "rust-cli",
      hasCargoToml: true,
    });
    assert.ok(rs.includes("## Stack\nRust"));

    const go = generateInitInstructions({
      workspaceName: "go-api",
      hasGoMod: true,
    });
    assert.ok(go.includes("## Stack\nGo"));
  });
});

describe("buildApplyPreviewReport", () => {
  it("creates diff table and filters unsafe or unchanged files", () => {
    const preview = buildApplyPreviewReport(
      "Compact instructions and extract TS rules",
      [
        {
          path: ".github/copilot-instructions.md",
          oldContent: "# Old\nLine 1\nLine 2\nLine 3",
          newContent: "# New\nLine 1",
          reason: "Compact global file",
        },
        {
          path: ".github/instructions/ts.instructions.md",
          oldContent: "",
          newContent: "---\napplyTo: \"**/*.ts\"\n---\n# TS Rules",
          reason: "Extract scoped rules",
        },
        {
          path: "unchanged.md",
          oldContent: "same",
          newContent: "same",
        },
        {
          path: "../unsafe.md",
          oldContent: "",
          newContent: "hack",
        },
      ],
    );

    assert.strictEqual(preview.changes.length, 2);
    assert.ok(preview.markdown.includes("Compact instructions and extract TS rules"));
    assert.ok(preview.markdown.includes("| `.github/copilot-instructions.md` | Update |"));
    assert.ok(preview.markdown.includes("| `.github/instructions/ts.instructions.md` | Create |"));
    assert.ok(preview.markdown.includes("```diff"));
    assert.ok(!preview.markdown.includes("unsafe.md"));
  });
});
