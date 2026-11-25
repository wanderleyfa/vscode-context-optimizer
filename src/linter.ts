import { posix as path } from "node:path";
import { getMessages } from "./i18n";
import type { ContextFile } from "./prompts";

export interface ParsedFrontmatter {
  fields: Record<string, string>;
  endLine: number;
}

export type LintIssueCode =
  | "THRESHOLD_EXCEEDED"
  | "MISSING_FRONTMATTER"
  | "MISSING_APPLY_TO"
  | "MISSING_DESCRIPTION"
  | "SKILL_NAME_MISMATCH"
  | "STALE_PATH"
  | "STALE_SCRIPT"
  | "DUPLICATE_HEADING"
  | "TOO_MANY_MCP_SERVERS";

export interface ContextLintIssue {
  file: string;
  line: number;
  severity: "warning" | "info";
  code: LintIssueCode;
  message: string;
}

export interface LintOptions {
  threshold?: number;
  existingPaths?: Set<string>;
  availableScripts?: Set<string>;
  locale?: string;
}

export interface DuplicateHeading {
  heading: string;
  files: string[];
}

export interface CrossToolSyncFile {
  path: string;
  content: string;
  reason: string;
}

export interface CrossToolSyncPlan {
  sourcePath: string;
  summary: string;
  files: CrossToolSyncFile[];
}

export function parseFrontmatter(content: string): ParsedFrontmatter | undefined {
  const normalized = content.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) return undefined;

  const lines = normalized.split("\n");
  let endLine = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      endLine = i;
      break;
    }
  }
  if (endLine === -1) return undefined;

  const fields: Record<string, string> = {};
  for (let i = 1; i < endLine; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) continue;
    const colonIdx = line.indexOf(":");
    if (colonIdx <= 0) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    fields[key] = value;
  }

  return { fields, endLine };
}

const FILE_PATH_TOKEN_REGEX =
  /(?:`([a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+)`|\[[^\]]+\]\(([a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+)\))/g;

export function extractReferencedPaths(content: string): string[] {
  const found = new Set<string>();
  for (const match of content.matchAll(FILE_PATH_TOKEN_REGEX)) {
    const candidate = (match[1] || match[2] || "").trim();
    if (!candidate) continue;
    if (
      candidate.startsWith("http://") ||
      candidate.startsWith("https://") ||
      candidate.startsWith("file://") ||
      candidate.includes("*") ||
      candidate.includes("<") ||
      candidate.includes(">")
    ) {
      continue;
    }
    if (!candidate.includes("/")) continue;
    const cleaned = candidate.replace(/^\.\//, "");
    if (cleaned.startsWith("..")) continue;
    found.add(cleaned);
  }
  return [...found];
}

const NPM_SCRIPT_REGEX = /\b(?:npm|pnpm|yarn|bun)\s+run\s+([a-zA-Z0-9:_-]+)/g;

export function extractReferencedScripts(content: string): string[] {
  const scripts = new Set<string>();
  for (const match of content.matchAll(NPM_SCRIPT_REGEX)) {
    if (match[1]) scripts.add(match[1]);
  }
  return [...scripts];
}

export function findDuplicateHeadings(
  files: ContextFile[],
): DuplicateHeading[] {
  const highFiles = files.filter((f) => f.cost === "HIGH");
  const headingMap = new Map<string, { display: string; files: Set<string> }>();

  for (const file of highFiles) {
    const lines = file.content.replace(/\r\n/g, "\n").split("\n");
    for (const line of lines) {
      const match = line.match(/^#{2,3}\s+(.+)$/);
      if (!match?.[1]) continue;
      const rawHeading = match[1].trim();
      const key = rawHeading.toLowerCase();
      if (!headingMap.has(key)) {
        headingMap.set(key, { display: rawHeading, files: new Set() });
      }
      headingMap.get(key)!.files.add(file.path);
    }
  }

  const duplicates: DuplicateHeading[] = [];
  for (const entry of headingMap.values()) {
    if (entry.files.size > 1) {
      duplicates.push({
        heading: entry.display,
        files: [...entry.files],
      });
    }
  }

  return duplicates;
}

export function lintContextFiles(
  files: ContextFile[],
  options: LintOptions = {},
): ContextLintIssue[] {
  const threshold = options.threshold ?? 80;
  const msg = getMessages(options.locale);
  const issues: ContextLintIssue[] = [];

  for (const file of files) {
    const lowerPath = file.path.toLowerCase();
    const fm = parseFrontmatter(file.content);

    // 1. Auto-loaded threshold check
    if (file.cost === "HIGH" && file.lines > threshold) {
      issues.push({
        file: file.path,
        line: 1,
        severity: "warning",
        code: "THRESHOLD_EXCEEDED",
        message: msg.lintThresholdExceeded(file.lines, threshold),
      });
    }

    // 2. Scoped .instructions.md must define applyTo in frontmatter
    if (lowerPath.endsWith(".instructions.md")) {
      if (!fm || !fm.fields.applyTo) {
        issues.push({
          file: file.path,
          line: 1,
          severity: "warning",
          code: "MISSING_APPLY_TO",
          message: msg.lintMissingApplyTo,
        });
      }
    }

    // 3. SKILL.md frontmatter validation (name must match parent folder)
    if (lowerPath.endsWith("/skill.md")) {
      const parentDir = path.basename(path.dirname(file.path));
      if (!fm) {
        issues.push({
          file: file.path,
          line: 1,
          severity: "warning",
          code: "MISSING_FRONTMATTER",
          message: msg.lintMissingSkillFrontmatter,
        });
      } else {
        if (!fm.fields.description) {
          issues.push({
            file: file.path,
            line: 1,
            severity: "warning",
            code: "MISSING_DESCRIPTION",
            message: msg.lintMissingSkillDescription,
          });
        }
        if (fm.fields.name && fm.fields.name !== parentDir) {
          issues.push({
            file: file.path,
            line: 1,
            severity: "warning",
            code: "SKILL_NAME_MISMATCH",
            message: msg.lintSkillNameMismatch(fm.fields.name, parentDir),
          });
        }
      }
    }

    // 4. Stale file path references
    if (options.existingPaths) {
      const referencedPaths = extractReferencedPaths(file.content);
      for (const refPath of referencedPaths) {
        if (!options.existingPaths.has(refPath)) {
          issues.push({
            file: file.path,
            line: findLineOfToken(file.content, refPath),
            severity: "warning",
            code: "STALE_PATH",
            message: msg.lintStalePath(refPath),
          });
        }
      }
    }

    // 5. Stale npm script references
    if (options.availableScripts && options.availableScripts.size > 0) {
      const referencedScripts = extractReferencedScripts(file.content);
      for (const scriptName of referencedScripts) {
        if (!options.availableScripts.has(scriptName)) {
          issues.push({
            file: file.path,
            line: findLineOfToken(file.content, `run ${scriptName}`),
            severity: "warning",
            code: "STALE_SCRIPT",
            message: msg.lintStaleScript(scriptName),
          });
        }
      }
    }

    // 6. MCP server count check
    if (
      lowerPath === ".vscode/mcp.json" ||
      lowerPath === ".cursor/mcp.json" ||
      lowerPath === ".mcp.json"
    ) {
      const serverCount = countMcpServers(file.content);
      if (serverCount > 5) {
        issues.push({
          file: file.path,
          line: 1,
          severity: "warning",
          code: "TOO_MANY_MCP_SERVERS",
          message: msg.lintTooManyMcpServers(serverCount),
        });
      }
    }
  }

  // 6. Cross-file duplicate headings
  const duplicateHeadings = findDuplicateHeadings(files);
  for (const dupe of duplicateHeadings) {
    for (const filePath of dupe.files) {
      const fileObj = files.find((f) => f.path === filePath);
      issues.push({
        file: filePath,
        line: fileObj ? findLineOfToken(fileObj.content, dupe.heading) : 1,
        severity: "info",
        code: "DUPLICATE_HEADING",
        message: msg.lintDuplicateHeading(dupe.heading, dupe.files.join(", ")),
      });
    }
  }

  return issues;
}

function findLineOfToken(content: string, token: string): number {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(token)) {
      return i + 1;
    }
  }
  return 1;
}

export function countMcpServers(content: string): number {
  try {
    const parsed = JSON.parse(content) as {
      servers?: Record<string, unknown>;
      mcpServers?: Record<string, unknown>;
    };
    const serversObj = parsed.servers || parsed.mcpServers;
    if (serversObj && typeof serversObj === "object") {
      return Object.keys(serversObj).length;
    }
    return 0;
  } catch {
    return 0;
  }
}

export function buildQuickFixContent(
  relativePath: string,
  content: string,
  code: LintIssueCode,
): string | undefined {
  const normalized = content.replace(/\r\n/g, "\n");
  const fm = parseFrontmatter(normalized);
  const parentDir = path.basename(path.dirname(relativePath));

  if (code === "MISSING_APPLY_TO") {
    if (!fm) {
      return `---\napplyTo: "**/*"\n---\n\n${normalized}`;
    }
    const lines = normalized.split("\n");
    lines.splice(1, 0, 'applyTo: "**/*"');
    return lines.join("\n");
  }

  if (code === "SKILL_NAME_MISMATCH") {
    if (!fm) {
      return `---\nname: ${parentDir}\ndescription: "Describe when to use ${parentDir}"\n---\n\n${normalized}`;
    }
    const lines = normalized.split("\n");
    for (let i = 1; i < fm.endLine; i++) {
      if (lines[i].trim().startsWith("name:")) {
        lines[i] = `name: ${parentDir}`;
        return lines.join("\n");
      }
    }
    lines.splice(1, 0, `name: ${parentDir}`);
    return lines.join("\n");
  }

  if (code === "MISSING_FRONTMATTER") {
    if (relativePath.toLowerCase().endsWith(".instructions.md")) {
      return `---\napplyTo: "**/*"\n---\n\n${normalized}`;
    }
    return `---\nname: ${parentDir}\ndescription: "Describe when to use ${parentDir}"\n---\n\n${normalized}`;
  }

  if (code === "MISSING_DESCRIPTION" && fm) {
    const lines = normalized.split("\n");
    lines.splice(
      fm.endLine,
      0,
      `description: "Describe when to use ${parentDir}"`,
    );
    return lines.join("\n");
  }

  return undefined;
}

export function buildCrossToolSyncPlan(
  files: ContextFile[],
): CrossToolSyncPlan {
  const agentsFile = files.find((f) => f.path.toLowerCase() === "agents.md");
  const copilotFile = files.find(
    (f) => f.path.toLowerCase() === ".github/copilot-instructions.md",
  );
  const claudeFile = files.find(
    (f) =>
      f.path.toLowerCase() === "claude.md" ||
      f.path.toLowerCase() === ".claude/claude.md",
  );
  const geminiFile = files.find(
    (f) => f.path.toLowerCase() === ".gemini/gemini.md",
  );

  const primary =
    agentsFile ||
    copilotFile ||
    claudeFile ||
    geminiFile ||
    files.find((f) => f.cost === "HIGH");

  if (!primary) {
    return {
      sourcePath: "AGENTS.md",
      summary: "No HIGH-cost context files found to synchronize.",
      files: [],
    };
  }

  const canonicalContent = primary.content.trim() + "\n";
  const syncedFiles: CrossToolSyncFile[] = [];

  if (primary.path !== "AGENTS.md") {
    syncedFiles.push({
      path: "AGENTS.md",
      content: canonicalContent,
      reason: `Single source of truth synchronized from ${primary.path}`,
    });
  }

  if (copilotFile && copilotFile.path !== primary.path) {
    syncedFiles.push({
      path: copilotFile.path,
      content: canonicalContent,
      reason: `Synchronized with canonical instructions from ${primary.path}`,
    });
  } else if (!copilotFile) {
    syncedFiles.push({
      path: ".github/copilot-instructions.md",
      content: canonicalContent,
      reason: "Created Copilot instructions synchronized with AGENTS.md",
    });
  }

  if (claudeFile) {
    const pointerContent =
      "# Claude Code Instructions\n\n@AGENTS.md\n";
    if (claudeFile.content.trim() !== pointerContent.trim()) {
      syncedFiles.push({
        path: claudeFile.path,
        content: pointerContent,
        reason:
          "Replaced duplicate instructions with lightweight @AGENTS.md reference",
      });
    }
  }

  if (geminiFile && geminiFile.path !== primary.path) {
    syncedFiles.push({
      path: geminiFile.path,
      content: canonicalContent,
      reason: `Synchronized Gemini instructions with ${primary.path}`,
    });
  }

  return {
    sourcePath: primary.path,
    summary: `Consolidated shared AI instructions using ${primary.path} / AGENTS.md as the single source of truth.`,
    files: syncedFiles,
  };
}
