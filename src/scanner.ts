import * as vscode from "vscode";
import { AI_CONTEXT_PATTERNS, classifyFile, type ContextFile } from "./prompts";

export async function discoverContextFiles(
  token?: vscode.CancellationToken,
): Promise<ContextFile[]> {
  const seen = new Set<string>();

  // Run all glob patterns in parallel
  const allUris = await Promise.all(
    AI_CONTEXT_PATTERNS.map((pattern) =>
      vscode.workspace.findFiles(pattern, "**/node_modules/**", 100),
    ),
  );

  if (token?.isCancellationRequested) return [];

  // Deduplicate URIs
  const uniqueUris: vscode.Uri[] = [];
  for (const uris of allUris) {
    for (const uri of uris) {
      const rel = vscode.workspace.asRelativePath(uri);
      if (!seen.has(rel)) {
        seen.add(rel);
        uniqueUris.push(uri);
      }
    }
  }

  // Read files in parallel using raw fs instead of openTextDocument
  const results = await Promise.all(
    uniqueUris.map(async (uri): Promise<ContextFile> => {
      const raw = await vscode.workspace.fs.readFile(uri);
      const content = Buffer.from(raw).toString("utf-8");
      const lines = content.split("\n").length;
      const rel = vscode.workspace.asRelativePath(uri);
      const classification = classifyFile(rel);
      return { path: rel, lines, content, ...classification };
    }),
  );

  results.sort((a, b) => {
    const costOrder = { HIGH: 0, MEDIUM: 1, LOW: 2, FREE: 3 };
    return costOrder[a.cost] - costOrder[b.cost] || b.lines - a.lines;
  });

  return results;
}

export function buildAuditReport(files: ContextFile[]): string {
  const totalAutoLoaded = files
    .filter((f) => f.cost === "HIGH")
    .reduce((sum, f) => sum + f.lines, 0);

  const totalMedium = files
    .filter((f) => f.cost === "MEDIUM")
    .reduce((sum, f) => sum + f.lines, 0);

  const totalScoped = files
    .filter((f) => f.cost === "LOW")
    .reduce((sum, f) => sum + f.lines, 0);

  const totalLazy = files
    .filter((f) => f.cost === "FREE")
    .reduce((sum, f) => sum + f.lines, 0);

  const totalAll = files.reduce((sum, f) => sum + f.lines, 0);

  let report = `## AI Context Audit Report\n\n`;
  report += `### Summary\n`;
  report += `| Metric | Lines |\n|---|---|\n`;
  report += `| **AUTO-LOADED (every session)** | **${totalAutoLoaded}** |\n`;
  report += `| Medium (conditional) | ${totalMedium} |\n`;
  report += `| Scoped (applyTo) | ${totalScoped} |\n`;
  report += `| Lazy (on-demand) | ${totalLazy} |\n`;
  report += `| **Total** | **${totalAll}** |\n\n`;

  report += `### Inventory\n\n`;
  report += `| File | Lines | Cost | Tool | Loading |\n`;
  report += `|------|-------|------|------|---------|\n`;
  for (const f of files) {
    const icon =
      f.cost === "HIGH"
        ? "🔴"
        : f.cost === "MEDIUM"
          ? "🟡"
          : f.cost === "LOW"
            ? "🟢"
            : "⚪";
    report += `| ${f.path} | ${f.lines} | ${icon} ${f.cost} | ${f.tool} | ${f.loading} |\n`;
  }

  if (totalAutoLoaded > 80) {
    report += `\n### ⚠️ Recommendations\n\n`;
    report += `1. **Compact global file** — ${totalAutoLoaded} auto-loaded lines exceeds the ~60-80 target. Move details to scoped \`.instructions.md\` files.\n`;

    const highFiles = files.filter((f) => f.cost === "HIGH");
    if (highFiles.length > 1) {
      report += `2. **Deduplicate** — ${highFiles.length} HIGH-cost files detected. Check for overlapping content between: ${highFiles.map((f) => f.path).join(", ")}.\n`;
    }
  } else {
    report += `\n### ✅ Context is well-optimized\n\n`;
    report += `Auto-loaded context (${totalAutoLoaded} lines) is within the ~60-80 line target.\n`;
  }

  return report;
}
