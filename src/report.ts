import { getMessages } from "./i18n";
import {
  findDuplicateHeadings,
  lintContextFiles,
  type ContextLintIssue,
} from "./linter";
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

export function buildAuditReport(
  files: ContextFile[],
  threshold = 80,
  lintIssues?: ContextLintIssue[],
  locale?: string,
): string {
  const msg = getMessages(locale);
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

  let report = `## ${msg.auditTitle}\n\n`;
  report += `### ${msg.summaryTitle}\n`;
  report += `| ${msg.metricCol} | ${msg.linesCol} | ${msg.tokensCol} |\n|---|---|---|\n`;
  report += `| **${msg.autoLoadedRow}** | **${totalAutoLoaded}** | **~${totalAutoLoadedTokens.toLocaleString()}** |\n`;
  report += `| ${msg.mediumRow} | ${totalMedium} | ~${totalMediumTokens.toLocaleString()} |\n`;
  report += `| ${msg.scopedRow} | ${totalScoped} | ~${totalScopedTokens.toLocaleString()} |\n`;
  report += `| ${msg.lazyRow} | ${totalLazy} | ~${totalLazyTokens.toLocaleString()} |\n`;
  report += `| **${msg.totalRow}** | **${totalAll}** | **~${totalAllTokens.toLocaleString()}** |\n\n`;

  report += `### ${msg.inventoryTitle}\n\n`;
  report += `| ${msg.fileCol} | ${msg.linesCol} | ${msg.tokensCol} | ${msg.costCol} | ${msg.toolCol} | ${msg.loadingCol} |\n`;
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
    report += `\n### ${msg.recommendationsTitle}\n\n`;
    report += msg.compactGlobalRec(
      totalAutoLoaded,
      totalAutoLoadedTokens.toLocaleString(),
      threshold,
    );

    const highFiles = files.filter((f) => f.cost === "HIGH");
    if (highFiles.length > 1) {
      report += msg.deduplicateRec(
        highFiles.length,
        highFiles.map((f) => f.path).join(", "),
      );
    }

    const dupes = findDuplicates(files);
    if (dupes.length > 0) {
      report += `\n### ${msg.similarityTitle}\n\n`;
      report += `| ${msg.fileACol} | ${msg.fileBCol} | ${msg.similarityCol} |\n|--------|--------|------------|\n`;
      for (const d of dupes) {
        report += `| ${d.fileA} | ${d.fileB} | ${d.percent}% |\n`;
      }
      report += `\n${msg.similarityNote}\n`;
    }
  } else {
    report += `\n### ${msg.wellOptimizedTitle}\n\n`;
    report += `${msg.wellOptimizedBody(
      totalAutoLoaded,
      totalAutoLoadedTokens.toLocaleString(),
      threshold,
    )}\n`;
  }

  const dupeHeadings = findDuplicateHeadings(files);
  if (dupeHeadings.length > 0) {
    report += `\n### ${msg.duplicateSectionsTitle}\n\n`;
    report += `| ${msg.headingCol} | ${msg.filesCol} |\n|---|---|\n`;
    for (const h of dupeHeadings) {
      report += `| \`## ${h.heading}\` | ${h.files.join(", ")} |\n`;
    }
  }

  const issues = lintIssues ?? lintContextFiles(files, { threshold, locale });
  const actionableIssues = issues.filter(
    (i) => i.code !== "THRESHOLD_EXCEEDED" && i.code !== "DUPLICATE_HEADING",
  );
  if (actionableIssues.length > 0) {
    report += `\n### ${msg.lintWarningsTitle}\n\n`;
    for (const issue of actionableIssues) {
      report += `- **${issue.file}:${issue.line}** (\`${issue.code}\`) — ${issue.message}\n`;
    }
  }

  return report;
}

export function getModeInstruction(
  command: string | undefined,
  userPrompt: string,
  threshold: number,
  locale?: string,
): string {
  const langNote = locale
    ? `\n\nIMPORTANT: Respond in the user's VS Code display language (${locale}).`
    : "";
  switch (command) {
    case "optimize":
      return (
        `Analyze the audit report and provide SPECIFIC file-by-file optimization recommendations. For each HIGH-cost file over ${threshold} lines, show exactly what sections to extract into scoped .instructions.md files with applyTo patterns. Show the projected before/after line counts.` +
        langNote
      );
    case "compare":
      return (
        `Show a detailed before/after comparison of what the optimized files would look like. Include projected line counts and reduction percentages. Do NOT actually make changes. Target: under ${threshold} auto-loaded lines.` +
        langNote
      );
    default:
      if (userPrompt) return userPrompt;
      return (
        `Analyze the audit report and GENERATE the optimized file contents directly. For each HIGH-cost file over ${threshold} lines, produce the compacted version AND the extracted scoped .instructions.md files with applyTo patterns. Show the complete file contents ready to apply, with before/after line counts. Be concrete — output the actual optimized files, not just suggestions.` +
        langNote
      );
  }
}
