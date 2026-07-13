import { createHash } from "node:crypto";

export interface ApplyPlanFile {
  path: string;
  content: string;
  reason?: string;
}

export interface ApplyPlan {
  summary: string;
  files: ApplyPlanFile[];
}

const CONFIRM_KEYWORDS = [
  "confirm",
  "--yes",
  "-y",
  "yes",
  "apply now",
  "confirmar",
  "sim",
  "aplicar",
];

export function isApplyConfirmation(userPrompt: string): boolean {
  const normalized = userPrompt.trim().toLowerCase();
  return CONFIRM_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export function isSafeRelativePath(path: string): boolean {
  if (!path || path.startsWith("/") || path.startsWith("\\") || path.includes(":")) {
    return false;
  }

  const normalized = path.replace(/\\/g, "/");
  const segments = normalized.split("/");
  return !segments.some((segment) => segment === ".." || segment === "");
}

export function extractJsonObject(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  const fencedMatch = raw.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) return fencedMatch[1].trim();

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return raw.slice(firstBrace, lastBrace + 1).trim();
  }

  return undefined;
}

export function parseApplyPlan(raw: string): ApplyPlan | undefined {
  const jsonText = extractJsonObject(raw);
  if (!jsonText) return undefined;

  let parsed: {
    summary?: unknown;
    files?: Array<{ path?: unknown; content?: unknown; reason?: unknown }>;
  };
  try {
    parsed = JSON.parse(jsonText) as {
      summary?: unknown;
      files?: Array<{ path?: unknown; content?: unknown; reason?: unknown }>;
    };
  } catch {
    return undefined;
  }

  if (!Array.isArray(parsed.files)) return undefined;

  const files: ApplyPlanFile[] = [];
  for (const file of parsed.files) {
    if (typeof file.path !== "string" || typeof file.content !== "string") {
      continue;
    }

    const normalizedPath = file.path.replace(/\\/g, "/");
    if (!isSafeRelativePath(normalizedPath)) continue;

    files.push({
      path: normalizedPath,
      content: file.content,
      reason: typeof file.reason === "string" ? file.reason : undefined,
    });
  }

  if (files.length === 0) return undefined;
  return {
    summary:
      typeof parsed.summary === "string"
        ? parsed.summary
        : "Optimization plan generated from current context files.",
    files,
  };
}

export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
