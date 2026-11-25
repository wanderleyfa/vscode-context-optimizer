import { hashContent, isSafeRelativePath } from "./apply";
import { buildUnifiedDiff, countLines } from "./diff";
import { getMessages } from "./i18n";
import type { ContextFile } from "./prompts";
import { buildAuditReport, estimateTokens } from "./report";

export const TOOL_NAMES = {
  AUDIT: "context-optimizer_audit",
  INIT: "context-optimizer_init",
  APPLY: "context-optimizer_apply",
  SYNC: "context-optimizer_sync",
} as const;

export const MAX_CONTENT_CHARS = 20000;

export interface PackageJsonMetadata {
  name?: string;
  displayName?: string;
  description?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface ProjectInitMetadata {
  workspaceName: string;
  packageJson?: PackageJsonMetadata;
  hasPyprojectToml?: boolean;
  hasCargoToml?: boolean;
  hasGoMod?: boolean;
}

export interface ProposedFileChange {
  path: string;
  oldContent: string;
  newContent: string;
  reason?: string;
}

export interface ValidatedFileChange extends ProposedFileChange {
  oldHash: string;
}

export interface ApplyPreviewReport {
  markdown: string;
  changes: ValidatedFileChange[];
}

export function buildFileContentsForModel(
  files: ContextFile[],
  maxChars = MAX_CONTENT_CHARS,
): string {
  let charBudget = maxChars;
  const contentParts: string[] = [];

  for (const file of files.filter(
    (f) => f.cost === "HIGH" || f.cost === "MEDIUM",
  )) {
    if (charBudget <= 0) break;
    const truncated =
      file.content.length > charBudget
        ? file.content.slice(0, charBudget) + "\n... (truncated)"
        : file.content;
    charBudget -= truncated.length;
    contentParts.push(
      `### ${file.path} (${file.lines} lines, ${file.cost})\n\`\`\`\n${truncated}\n\`\`\``,
    );
  }

  return contentParts.join("\n\n");
}

export function formatAuditToolPayload(
  files: ContextFile[],
  threshold = 80,
  includeContents = true,
  locale?: string,
): string {
  const msg = getMessages(locale);
  if (files.length === 0) {
    return msg.noContextFilesFound;
  }

  const auditReport = buildAuditReport(files, threshold, undefined, locale);
  if (!includeContents) {
    return auditReport;
  }

  const fileContents = buildFileContentsForModel(files);
  if (!fileContents) {
    return auditReport;
  }

  return `${auditReport}\n\n## File Contents (HIGH and MEDIUM cost)\n\n${fileContents}`;
}

export function generateInitInstructions(
  meta: ProjectInitMetadata,
  locale?: string,
): string {
  const msg = getMessages(locale);
  let projectName = meta.workspaceName;
  let projectDescription = "";
  let stack = "Unknown";
  let scripts: Record<string, string> = {};

  if (meta.packageJson) {
    const pkg = meta.packageJson;
    projectName = pkg.displayName || pkg.name || projectName;
    projectDescription = pkg.description || "";
    scripts = pkg.scripts || {};

    const deps = [
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.devDependencies || {}),
    ];
    const frameworks: string[] = [];
    if (deps.some((d) => d.includes("react"))) frameworks.push("React");
    if (deps.some((d) => d.includes("next"))) frameworks.push("Next.js");
    if (deps.some((d) => d.includes("vue"))) frameworks.push("Vue");
    if (deps.some((d) => d.includes("angular"))) frameworks.push("Angular");
    if (deps.some((d) => d.includes("express"))) frameworks.push("Express");
    if (deps.some((d) => d.includes("fastify"))) frameworks.push("Fastify");
    if (deps.includes("typescript")) frameworks.push("TypeScript");
    if (deps.some((d) => d.includes("prisma"))) frameworks.push("Prisma");
    if (deps.some((d) => d.includes("tailwind"))) {
      frameworks.push("Tailwind CSS");
    }
    stack = frameworks.join(", ") || "Node.js";
  } else if (meta.hasPyprojectToml) {
    stack = "Python";
  } else if (meta.hasCargoToml) {
    stack = "Rust";
  } else if (meta.hasGoMod) {
    stack = "Go";
  }

  const essentialCommands: string[] = [];
  for (const [key, desc] of Object.entries(msg.initCommandDescriptions)) {
    if (scripts[key]) {
      essentialCommands.push(`- \`npm run ${key}\` — ${desc}`);
    }
  }

  const lines: string[] = [
    "# Copilot Instructions",
    "",
    msg.initProjectHeading,
    projectDescription
      ? `${projectName} — ${projectDescription}`
      : projectName,
    "",
    msg.initStackHeading,
    stack,
    "",
    msg.initRulesHeading,
    ...msg.initRulesList,
    "",
  ];

  if (essentialCommands.length > 0) {
    lines.push(msg.initCommandsHeading, ...essentialCommands, "");
  }

  return lines.join("\n");
}

export function buildApplyPreviewReport(
  summary: string,
  proposed: ProposedFileChange[],
  maxFiles = 8,
  locale?: string,
): ApplyPreviewReport {
  const msg = getMessages(locale);
  const changes: ValidatedFileChange[] = [];

  for (const item of proposed) {
    if (changes.length >= maxFiles) break;
    const normalizedPath = item.path.replace(/\\/g, "/");
    if (!isSafeRelativePath(normalizedPath)) continue;
    if (item.oldContent === item.newContent) continue;

    changes.push({
      path: normalizedPath,
      oldContent: item.oldContent,
      newContent: item.newContent,
      oldHash: hashContent(item.oldContent),
      reason: item.reason,
    });
  }

  if (changes.length === 0) {
    return {
      markdown: msg.noChangesProposed,
      changes: [],
    };
  }

  const parts: string[] = [
    msg.applyPreviewTitle,
    `${summary}\n\n`,
    `| ${msg.fileCol} | ${msg.actionCol} | Δ${msg.linesCol} | ΔTokens |\n|---|---|---:|---:|\n`,
  ];

  for (const change of changes) {
    const oldLines = countLines(change.oldContent);
    const newLines = countLines(change.newContent);
    const oldTokens = estimateTokens(oldLines, change.oldContent);
    const newTokens = estimateTokens(newLines, change.newContent);
    const action = oldLines === 0 ? msg.actionCreate : msg.actionUpdate;
    const lineDelta = `${newLines - oldLines >= 0 ? "+" : ""}${newLines - oldLines}`;
    const tokenDelta = `${newTokens - oldTokens >= 0 ? "+" : ""}${newTokens - oldTokens}`;
    parts.push(
      `| \`${change.path}\` | ${action} | ${lineDelta} | ${tokenDelta} |\n`,
    );
  }

  for (const change of changes) {
    const diff = buildUnifiedDiff(
      change.path,
      change.oldContent,
      change.newContent,
      80,
    );
    parts.push(
      `\n<details><summary><code>${change.path}</code>${change.reason ? ` — ${change.reason}` : ""}</summary>\n\n` +
        "```diff\n" +
        `${diff.patch}\n` +
        "```\n\n" +
        "</details>\n",
    );
  }

  return {
    markdown: parts.join(""),
    changes,
  };
}
