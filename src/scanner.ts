import * as vscode from "vscode";
import { AI_CONTEXT_PATTERNS, classifyFile, type ContextFile } from "./prompts";

function getScannerSettings(): { excludeGlob: string; maxFilesPerPattern: number } {
  const config = vscode.workspace.getConfiguration("contextOptimizer");
  return {
    excludeGlob: config.get<string>(
      "excludeGlob",
      "**/{node_modules,dist,build,.git,.next,.turbo,.pnpm-store}/**",
    ),
    maxFilesPerPattern: config.get<number>("maxFilesPerPattern", 1000),
  };
}

export async function discoverContextFiles(
  token?: vscode.CancellationToken,
): Promise<ContextFile[]> {
  const { excludeGlob, maxFilesPerPattern } = getScannerSettings();
  const seen = new Set<string>();

  // Run all glob patterns in parallel
  const allUris = await Promise.all(
    AI_CONTEXT_PATTERNS.map((pattern) =>
      vscode.workspace.findFiles(pattern, excludeGlob, maxFilesPerPattern),
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
