import * as assert from "node:assert";
import { describe, it } from "node:test";
import {
  extractJsonObject,
  hashContent,
  isApplyConfirmation,
  isSafeRelativePath,
  parseApplyPlan,
} from "../apply";

describe("isApplyConfirmation", () => {
  it("detects explicit confirmation keywords", () => {
    assert.ok(isApplyConfirmation("confirm"));
    assert.ok(isApplyConfirmation("please apply now"));
    assert.ok(isApplyConfirmation("sim, pode aplicar"));
  });

  it("does not detect regular prompts as confirmation", () => {
    assert.ok(!isApplyConfirmation("preview only"));
  });
});

describe("extractJsonObject", () => {
  it("extracts fenced JSON blocks", () => {
    const raw = "text\n```json\n{\"summary\":\"ok\",\"files\":[]}\n```\n";
    assert.strictEqual(extractJsonObject(raw), '{"summary":"ok","files":[]}');
  });
});

describe("isSafeRelativePath", () => {
  it("accepts safe relative paths", () => {
    assert.ok(isSafeRelativePath(".github/instructions/refactor.instructions.md"));
  });

  it("rejects absolute and traversal paths", () => {
    assert.ok(!isSafeRelativePath("/etc/passwd"));
    assert.ok(!isSafeRelativePath("../secret.md"));
    assert.ok(!isSafeRelativePath("C:/temp/file.md"));
  });
});

describe("parseApplyPlan", () => {
  it("parses valid JSON plan", () => {
    const raw =
      '{"summary":"Update files","files":[{"path":".github/copilot-instructions.md","content":"# Title","reason":"compact"}]}';
    const plan = parseApplyPlan(raw);
    assert.ok(plan);
    assert.strictEqual(plan?.files.length, 1);
    assert.strictEqual(plan?.files[0].path, ".github/copilot-instructions.md");
  });

  it("filters unsafe file paths", () => {
    const raw =
      '{"summary":"x","files":[{"path":"../outside.md","content":"bad"},{"path":".github/copilot-instructions.md","content":"ok"}]}';
    const plan = parseApplyPlan(raw);
    assert.ok(plan);
    assert.strictEqual(plan?.files.length, 1);
    assert.strictEqual(plan?.files[0].path, ".github/copilot-instructions.md");
  });

  it("returns undefined for invalid JSON", () => {
    assert.strictEqual(parseApplyPlan("not json"), undefined);
  });
});

describe("hashContent", () => {
  it("returns stable hashes", () => {
    const a = hashContent("hello");
    const b = hashContent("hello");
    const c = hashContent("hello!");
    assert.strictEqual(a, b);
    assert.notStrictEqual(a, c);
  });
});

