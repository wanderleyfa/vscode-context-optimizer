import * as assert from "node:assert";
import { describe, it } from "node:test";
import { buildUnifiedDiff, countLines } from "../diff";

describe("countLines", () => {
  it("counts lines from content", () => {
    assert.strictEqual(countLines(""), 0);
    assert.strictEqual(countLines("one"), 1);
    assert.strictEqual(countLines("one\ntwo"), 2);
  });
});

describe("buildUnifiedDiff", () => {
  it("returns no-change patch when contents match", () => {
    const diff = buildUnifiedDiff("file.md", "same", "same");
    assert.strictEqual(diff.added, 0);
    assert.strictEqual(diff.removed, 0);
    assert.ok(diff.patch.includes("no changes"));
  });

  it("computes additions and removals", () => {
    const diff = buildUnifiedDiff("file.md", "a\nb\nc", "a\nx\nc\nd");
    assert.ok(diff.added > 0);
    assert.ok(diff.removed > 0);
    assert.ok(diff.patch.includes("--- a/file.md"));
    assert.ok(diff.patch.includes("+++ b/file.md"));
  });

  it("truncates long previews", () => {
    const before = Array.from({ length: 80 }, (_, i) => `old-${i}`).join("\n");
    const after = Array.from({ length: 80 }, (_, i) => `new-${i}`).join("\n");
    const diff = buildUnifiedDiff("large.md", before, after, 10);
    assert.ok(diff.truncated);
    assert.ok(diff.patch.includes("truncated"));
  });
});

