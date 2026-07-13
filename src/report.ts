import type { ContextFile } from "./prompts";

const CHARS_PER_TOKEN = 4;

export function estimateTokens(lines: number, content?: string): number {
  if (!content) {
    return Math.round(lines * 25);
  }

  const normalized = content.replace(/\r\n/g, "\n");
  const charCount = normalized.length;
  if (charCount === 0) return 0;

  const lineCount = normalized.split("\n").length;
  const wordCount = normalized.trim().length
    ? normalized.trim().split(/\s+/).length
    : 0;
  const punctuationCount = (normalized.match(/[{}[\]()`*#<>|:_-]/g) || [])
    .length;

  const base = Math.ceil(charCount / CHARS_PER_TOKEN);
  const lineOverhead = Math.ceil(lineCount * 0.4);
  const wordOverhead = Math.ceil(wordCount * 0.08);
  const punctuationOverhead = Math.ceil(punctuationCount * 0.12);

  return base + lineOverhead + wordOverhead + punctuationOverhead;
}

/** Compute bigram set for a string (lowercased, whitespace-normalized). */
function bigrams(text: string): Set<string> {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  const set = new Set<string>();
  for (let i = 0; i < normalized.length - 1; i++) {
    set.add(normalized.slice(i, i + 2));
  }
  return set;
}

/** Dice coefficient: 2 * |A ∩ B| / (|A| + |B|). Returns 0-1. */
export function similarity(a: string, b: string): number {
  const setA = bigrams(a);
  const setB = bigrams(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const bg of setA) {
    if (setB.has(bg)) intersection++;
  }
  return (2 * intersection) / (setA.size + setB.size);
}

/** Find pairs of HIGH-cost files with >40% content similarity. */
export function findDuplicates(
  files: ContextFile[],
): { fileA: string; fileB: string; percent: number }[] {
  const highFiles = files.filter(
    (f) => f.cost === "HIGH" && f.content.length > 0,
  );
  const pairs: { fileA: string; fileB: string; percent: number }[] = [];
  for (let i = 0; i < highFiles.length; i++) {
    for (let j = i + 1; j < highFiles.length; j++) {
      const score = similarity(highFiles[i].content, highFiles[j].content);
      if (score > 0.4) {
        pairs.push({
          fileA: highFiles[i].path,
          fileB: highFiles[j].path,
          percent: Math.round(score * 100),
        });
      }
    }
  }
  return pairs.sort((a, b) => b.percent - a.percent);
}

export function buildAuditReport(files: ContextFile[], threshold = 80): string {
  const tokenByPath = new Map(
    files.map((f) => [f.path, estimateTokens(f.lines, f.content)]),
  );

  const totalAutoLoaded = files
    .filter((f) => f.cost === "HIGH")
    .reduce((sum, f) => sum + f.lines, 0);
  const totalAutoLoadedTokens = files
    .filter((f) => f.cost === "HIGH")
    .reduce((sum, f) => sum + (tokenByPath.get(f.path) || 0), 0);

  const totalMedium = files
    .filter((f) => f.cost === "MEDIUM")
    .reduce((sum, f) => sum + f.lines, 0);
  const totalMediumTokens = files
    .filter((f) => f.cost === "MEDIUM")
    .reduce((sum, f) => sum + (tokenByPath.get(f.path) || 0), 0);

  const totalScoped = files
    .filter((f) => f.cost === "LOW")
    .reduce((sum, f) => sum + f.lines, 0);
  const totalScopedTokens = files
    .filter((f) => f.cost === "LOW")
    .reduce((sum, f) => sum + (tokenByPath.get(f.path) || 0), 0);

  const totalLazy = files
    .filter((f) => f.cost === "FREE")
    .reduce((sum, f) => sum + f.lines, 0);
  const totalLazyTokens = files
    .filter((f) => f.cost === "FREE")
    .reduce((sum, f) => sum + (tokenByPath.get(f.path) || 0), 0);

  const totalAll = files.reduce((sum, f) => sum + f.lines, 0);
  const totalAllTokens = files.reduce(
    (sum, f) => sum + (tokenByPath.get(f.path) || 0),
    0,
  );

  let report = `## AI Context Audit Report\n\n`;
  report += `### Summary\n`;
  report += `| Metric | Lines | ~Tokens |\n|---|---|---|\n`;
  report += `| **AUTO-LOADED (every session)** | **${totalAutoLoaded}** | **~${totalAutoLoadedTokens.toLocaleString()}** |\n`;
  report += `| Medium (conditional) | ${totalMedium} | ~${totalMediumTokens.toLocaleString()} |\n`;
  report += `| Scoped (applyTo) | ${totalScoped} | ~${totalScopedTokens.toLocaleString()} |\n`;
  report += `| Lazy (on-demand) | ${totalLazy} | ~${totalLazyTokens.toLocaleString()} |\n`;
  report += `| **Total** | **${totalAll}** | **~${totalAllTokens.toLocaleString()}** |\n\n`;

  report += `### Inventory\n\n`;
  report += `| File | Lines | ~Tokens | Cost | Tool | Loading |\n`;
  report += `|------|-------|---------|------|------|---------|\n`;
  for (const f of files) {
    const icon =
      f.cost === "HIGH"
        ? "🔴"
        : f.cost === "MEDIUM"
          ? "🟡"
          : f.cost === "LOW"
            ? "🟢"
            : "⚪";
    report += `| ${f.path} | ${f.lines} | ~${(tokenByPath.get(f.path) || 0).toLocaleString()} | ${icon} ${f.cost} | ${f.tool} | ${f.loading} |\n`;
  }

  if (totalAutoLoaded > threshold) {
    report += `\n### ⚠️ Recommendations\n\n`;
    report += `1. **Compact global file** — ${totalAutoLoaded} auto-loaded lines (~${totalAutoLoadedTokens.toLocaleString()} tokens) exceeds the ~${threshold}-line target. Move details to scoped \`.instructions.md\` files.\n`;

    const highFiles = files.filter((f) => f.cost === "HIGH");
    if (highFiles.length > 1) {
      report += `2. **Deduplicate** — ${highFiles.length} HIGH-cost files detected. Check for overlapping content between: ${highFiles.map((f) => f.path).join(", ")}.\n`;
    }

    const dupes = findDuplicates(files);
    if (dupes.length > 0) {
      report += `\n### 🔁 Content Similarity\n\n`;
      report += `| File A | File B | Similarity |\n|--------|--------|------------|\n`;
      for (const d of dupes) {
        report += `| ${d.fileA} | ${d.fileB} | ${d.percent}% |\n`;
      }
      report += `\n> Files with high similarity likely contain duplicated instructions. Consider creating a single source of truth.\n`;
    }
  } else {
    report += `\n### ✅ Context is well-optimized\n\n`;
    report += `Auto-loaded context (${totalAutoLoaded} lines, ~${totalAutoLoadedTokens.toLocaleString()} tokens) is within the ~${threshold}-line target.\n`;
  }

  return report;
}

export function getModeInstruction(
  command: string | undefined,
  userPrompt: string,
  threshold: number,
): string {
  switch (command) {
    case "optimize":
      return `Analyze the audit report and provide SPECIFIC file-by-file optimization recommendations. For each HIGH-cost file over ${threshold} lines, show exactly what sections to extract into scoped .instructions.md files with applyTo patterns. Show the projected before/after line counts.`;
    case "compare":
      return `Show a detailed before/after comparison of what the optimized files would look like. Include projected line counts and reduction percentages. Do NOT actually make changes. Target: under ${threshold} auto-loaded lines.`;
    default:
      return (
        userPrompt ||
        `Analyze the audit report and GENERATE the optimized file contents directly. For each HIGH-cost file over ${threshold} lines, produce the compacted version AND the extracted scoped .instructions.md files with applyTo patterns. Show the complete file contents ready to apply, with before/after line counts. Be concrete — output the actual optimized files, not just suggestions.`
      );
  }
}
