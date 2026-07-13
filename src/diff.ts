export interface DiffPreview {
  patch: string;
  added: number;
  removed: number;
  truncated: boolean;
}

export function countLines(content: string): number {
  if (!content) return 0;
  return content.split("\n").length;
}

export function buildUnifiedDiff(
  filePath: string,
  beforeContent: string,
  afterContent: string,
  maxBodyLines = 140,
): DiffPreview {
  if (beforeContent === afterContent) {
    return {
      patch: `--- a/${filePath}\n+++ b/${filePath}\n@@ no changes @@`,
      added: 0,
      removed: 0,
      truncated: false,
    };
  }

  const beforeLines = beforeContent.split("\n");
  const afterLines = afterContent.split("\n");

  let prefix = 0;
  while (
    prefix < beforeLines.length &&
    prefix < afterLines.length &&
    beforeLines[prefix] === afterLines[prefix]
  ) {
    prefix++;
  }

  let suffix = 0;
  while (
    suffix < beforeLines.length - prefix &&
    suffix < afterLines.length - prefix &&
    beforeLines[beforeLines.length - 1 - suffix] ===
      afterLines[afterLines.length - 1 - suffix]
  ) {
    suffix++;
  }

  const removedLines = beforeLines.slice(prefix, beforeLines.length - suffix);
  const addedLines = afterLines.slice(prefix, afterLines.length - suffix);
  const bodyLines = [
    ...removedLines.map((line) => `-${line}`),
    ...addedLines.map((line) => `+${line}`),
  ];

  const truncated = bodyLines.length > maxBodyLines;
  const visibleBody = truncated ? bodyLines.slice(0, maxBodyLines) : bodyLines;
  const hunk = `@@ -${prefix + 1},${removedLines.length} +${prefix + 1},${addedLines.length} @@`;
  const truncationNotice = truncated
    ? ["... (diff truncated in preview)"]
    : [];

  return {
    patch: [
      `--- a/${filePath}`,
      `+++ b/${filePath}`,
      hunk,
      ...visibleBody,
      ...truncationNotice,
    ].join("\n"),
    added: addedLines.length,
    removed: removedLines.length,
    truncated,
  };
}

