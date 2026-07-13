import { posix as path } from "node:path";
import * as vscode from "vscode";
import { hashContent, isApplyConfirmation, parseApplyPlan } from "./apply";
import { buildUnifiedDiff, countLines } from "./diff";
import { SYSTEM_PROMPT, type ContextFile } from "./prompts";
import { buildAuditReport, estimateTokens, getModeInstruction } from "./report";
import { discoverContextFiles } from "./scanner";

const PARTICIPANT_ID = "context-optimizer.agent";
const MAX_CONTENT_CHARS = 20000;
const APPLY_PLAN_TTL_MS = 15 * 60 * 1000;

interface PendingChange {
  path: string;
  oldContent: string;
  newContent: string;
  oldHash: string;
  reason?: string;
}

interface PendingApplyPlan {
  createdAt: number;
  summary: string;
  changes: PendingChange[];
}

const pendingApplyPlans = new Map<string, PendingApplyPlan>();

function getThreshold(): number {
  return vscode.workspace
    .getConfiguration("contextOptimizer")
    .get<number>("autoLoadedLineThreshold", 80);
}

function getWorkspaceRoot(): vscode.WorkspaceFolder | undefined {
  return vscode.workspace.workspaceFolders?.[0];
}

function getWorkspaceKey(): string | undefined {
  const root = getWorkspaceRoot();
  return root?.uri.toString();
}

function toWorkspaceUri(rootUri: vscode.Uri, relativePath: string): vscode.Uri {
  return relativePath
    .split("/")
    .filter(Boolean)
    .reduce((uri, part) => vscode.Uri.joinPath(uri, part), rootUri);
}

async function readWorkspaceText(
  rootUri: vscode.Uri,
  relativePath: string,
): Promise<string | undefined> {
  const uri = toWorkspaceUri(rootUri, relativePath);
  try {
    const raw = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(raw).toString("utf-8");
  } catch {
    return undefined;
  }
}

async function ensureParentDirectory(
  rootUri: vscode.Uri,
  relativePath: string,
): Promise<void> {
  const parentPath = path.dirname(relativePath);
  if (parentPath === ".") return;
  await vscode.workspace.fs.createDirectory(toWorkspaceUri(rootUri, parentPath));
}

function buildFileContentsForModel(files: ContextFile[]): string {
  let charBudget = MAX_CONTENT_CHARS;
  const contentParts: string[] = [];

  for (const file of files.filter((f) => f.cost === "HIGH" || f.cost === "MEDIUM")) {
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

function buildHistoryMessages(chatContext: vscode.ChatContext): string[] {
  return chatContext.history
    .filter(
      (turn): turn is vscode.ChatRequestTurn =>
        turn instanceof vscode.ChatRequestTurn,
    )
    .slice(-3)
    .map((turn) => turn.prompt)
    .filter(Boolean);
}

function buildHelpMarkdown(): string {
  return (
    "## AI Context Optimizer\n\n" +
    "| Command | Description |\n|---|---|\n" +
    "| `@context-optimizer` | Scan & generate optimized files |\n" +
    "| `@context-optimizer /audit` | Read-only audit report with token costs |\n" +
    "| `@context-optimizer /optimize` | Detailed optimization plan |\n" +
    "| `@context-optimizer /compare` | Before/after projection |\n" +
    "| `@context-optimizer /apply` | Preview changes and apply with explicit confirmation |\n" +
    "| `@context-optimizer /init` | Scaffold context files from project |\n" +
    "| `@context-optimizer /help` | Show this help |\n\n" +
    "**Settings:**\n" +
    "- `contextOptimizer.autoLoadedLineThreshold` — max recommended lines for auto-loaded files (default: 80)\n" +
    "- `contextOptimizer.maxFilesPerPattern` — max matches per scan pattern (default: 1000)\n" +
    "- `contextOptimizer.excludeGlob` — directories excluded from scan\n"
  );
}

export function activate(context: vscode.ExtensionContext) {
  const participant = vscode.chat.createChatParticipant(
    PARTICIPANT_ID,
    handler,
  );

  participant.iconPath = new vscode.ThemeIcon("sparkle");
  context.subscriptions.push(participant);
}

const handler: vscode.ChatRequestHandler = async (
  request: vscode.ChatRequest,
  chatContext: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<void> => {
  try {
    await handleRequest(request, chatContext, stream, token);
  } catch (err) {
    if (err instanceof vscode.CancellationError) return;
    const message = err instanceof Error ? err.message : String(err);
    stream.markdown(
      `\n\n**Error:** ${message}\n\nPlease try again or run \`@context-optimizer /audit\` for a basic report.`,
    );
  }
};

async function handleRequest(
  request: vscode.ChatRequest,
  chatContext: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<void> {
  const command = request.command;
  const userPrompt = request.prompt || "";

  if (command === "help") {
    stream.markdown(buildHelpMarkdown());
    return;
  }

  if (command === "init") {
    stream.progress("Analyzing project structure...");
    await handleInit(stream, token);
    return;
  }

  if (command === "apply" && isApplyConfirmation(userPrompt)) {
    await applyPendingPlan(stream, token);
    return;
  }

  stream.progress("Scanning workspace for AI context files...");
  const files = await discoverContextFiles(token);

  if (files.length === 0) {
    stream.markdown(
      "No AI context files found in this workspace. Nothing to optimize.\n\n" +
        "Add context files like `.github/copilot-instructions.md`, `CLAUDE.md`, or `.cursorrules` to get started.",
    );
    return;
  }

  const threshold = getThreshold();
  const auditReport = buildAuditReport(files, threshold);

  if (command === "audit") {
    stream.markdown(auditReport);
    addFileAnchors(stream, files);
    stream.markdown(
      "\n\n---\n*Next steps: `/optimize` for recommendations, `/compare` for projection, or `/apply` to preview executable changes.*",
    );
    return;
  }

  if (command === "apply") {
    await previewApplyPlan(files, auditReport, chatContext, stream, token);
    return;
  }

  await handleModelRecommendations(
    command,
    userPrompt,
    files,
    auditReport,
    threshold,
    chatContext,
    stream,
    token,
  );
}

async function handleModelRecommendations(
  command: string | undefined,
  userPrompt: string,
  files: ContextFile[],
  auditReport: string,
  threshold: number,
  chatContext: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<void> {
  const model = (await vscode.lm.selectChatModels({}))[0];
  if (!model) {
    stream.markdown(auditReport);
    stream.markdown(
      "\n\n*No language model available for detailed analysis. Showing audit report only.*",
    );
    return;
  }

  const fileContents = buildFileContentsForModel(files);
  const historyMessages = buildHistoryMessages(chatContext);

  const messages = [
    vscode.LanguageModelChatMessage.User(SYSTEM_PROMPT),
    ...(historyMessages.length > 0
      ? [
          vscode.LanguageModelChatMessage.User(
            `Previous conversation context:\n${historyMessages.map((message) => `- ${message}`).join("\n")}`,
          ),
        ]
      : []),
    vscode.LanguageModelChatMessage.User(
      `Here is the audit report for this workspace:\n\n${auditReport}\n\n` +
        `File inventory:\n${files.map((f) => `- ${f.path}: ${f.lines} lines (${f.cost})`).join("\n")}\n\n` +
        (fileContents
          ? `File contents (HIGH and MEDIUM cost):\n\n${fileContents}\n\n`
          : "") +
        getModeInstruction(command, userPrompt, threshold),
    ),
  ];

  const response = await model.sendRequest(messages, {}, token);
  for await (const chunk of response.text) {
    stream.markdown(chunk);
  }
}

async function previewApplyPlan(
  files: ContextFile[],
  auditReport: string,
  chatContext: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<void> {
  const model = (await vscode.lm.selectChatModels({}))[0];
  if (!model) {
    stream.markdown(
      "No language model available to build an apply plan. Use `/optimize` for guidance and apply manually.",
    );
    return;
  }

  const root = getWorkspaceRoot();
  const workspaceKey = getWorkspaceKey();
  if (!root || !workspaceKey) {
    stream.markdown("No workspace folder open. Open a project first.");
    return;
  }

  stream.progress("Building executable optimization plan...");
  const fileContents = buildFileContentsForModel(files);
  const historyMessages = buildHistoryMessages(chatContext);
  const threshold = getThreshold();

  const planPrompt =
    `You must output ONLY valid JSON with this exact shape:\n` +
    `{"summary":"string","files":[{"path":"relative/path.ext","content":"full file content","reason":"short reason"}]}\n\n` +
    `Rules:\n` +
    `- Use only facts from current files; do not invent new project policies.\n` +
    `- Keep total AUTO-LOADED context under ${threshold} lines when possible.\n` +
    `- Prefer creating or updating scoped .instructions.md files instead of expanding global files.\n` +
    `- Do not delete files.\n` +
    `- Include complete content for every file in "files".\n` +
    `- Limit to at most 8 files.\n`;

  const messages = [
    vscode.LanguageModelChatMessage.User(SYSTEM_PROMPT),
    ...(historyMessages.length > 0
      ? [
          vscode.LanguageModelChatMessage.User(
            `Previous conversation context:\n${historyMessages.map((message) => `- ${message}`).join("\n")}`,
          ),
        ]
      : []),
    vscode.LanguageModelChatMessage.User(
      `Here is the audit report for this workspace:\n\n${auditReport}\n\n` +
        `File inventory:\n${files.map((f) => `- ${f.path}: ${f.lines} lines (${f.cost})`).join("\n")}\n\n` +
        (fileContents
          ? `File contents (HIGH and MEDIUM cost):\n\n${fileContents}\n\n`
          : "") +
        planPrompt,
    ),
  ];

  const response = await model.sendRequest(messages, {}, token);
  let rawPlanResponse = "";
  for await (const chunk of response.text) {
    rawPlanResponse += chunk;
  }

  const parsedPlan = parseApplyPlan(rawPlanResponse);
  if (!parsedPlan) {
    stream.markdown(
      "I couldn't generate a machine-readable apply plan this time. Run `/apply` again or use `/optimize` for manual recommendations.",
    );
    return;
  }

  const limitedFiles = parsedPlan.files.slice(0, 8);
  const changes: PendingChange[] = [];
  for (const planned of limitedFiles) {
    if (token.isCancellationRequested) return;

    const oldContent = (await readWorkspaceText(root.uri, planned.path)) ?? "";
    if (oldContent === planned.content) continue;

    changes.push({
      path: planned.path,
      oldContent,
      newContent: planned.content,
      oldHash: hashContent(oldContent),
      reason: planned.reason,
    });
  }

  if (changes.length === 0) {
    stream.markdown(
      "No file changes were proposed (or all proposed contents already match your workspace).",
    );
    return;
  }

  pendingApplyPlans.set(workspaceKey, {
    createdAt: Date.now(),
    summary: parsedPlan.summary,
    changes,
  });

  stream.markdown("## /apply preview (no files changed yet)\n\n");
  stream.markdown(`${parsedPlan.summary}\n\n`);
  stream.markdown("| File | Action | ΔLines | ΔTokens |\n|---|---|---:|---:|\n");

  for (const change of changes) {
    const oldLines = countLines(change.oldContent);
    const newLines = countLines(change.newContent);
    const oldTokens = estimateTokens(oldLines, change.oldContent);
    const newTokens = estimateTokens(newLines, change.newContent);
    const action = oldLines === 0 ? "Create" : "Update";
    const lineDelta = `${newLines - oldLines >= 0 ? "+" : ""}${newLines - oldLines}`;
    const tokenDelta = `${newTokens - oldTokens >= 0 ? "+" : ""}${newTokens - oldTokens}`;
    stream.markdown(
      `| \`${change.path}\` | ${action} | ${lineDelta} | ${tokenDelta} |\n`,
    );
  }

  for (const change of changes) {
    const diff = buildUnifiedDiff(change.path, change.oldContent, change.newContent, 80);
    stream.markdown(
      `\n<details><summary><code>${change.path}</code>${change.reason ? ` — ${change.reason}` : ""}</summary>\n\n` +
        "```diff\n" +
        `${diff.patch}\n` +
        "```\n\n" +
        "</details>\n",
    );
  }

  stream.markdown(
    "\nRun `@context-optimizer /apply confirm` to write these files. " +
      `This preview expires in ${Math.floor(APPLY_PLAN_TTL_MS / 60000)} minutes.`,
  );
}

async function applyPendingPlan(
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<void> {
  const root = getWorkspaceRoot();
  const workspaceKey = getWorkspaceKey();
  if (!root || !workspaceKey) {
    stream.markdown("No workspace folder open. Open a project first.");
    return;
  }

  const pending = pendingApplyPlans.get(workspaceKey);
  if (!pending) {
    stream.markdown(
      "No pending preview found. Run `@context-optimizer /apply` first to generate a preview before confirming.",
    );
    return;
  }

  if (Date.now() - pending.createdAt > APPLY_PLAN_TTL_MS) {
    pendingApplyPlans.delete(workspaceKey);
    stream.markdown(
      "The previous `/apply` preview expired. Run `/apply` again to generate a fresh plan.",
    );
    return;
  }

  stream.progress("Applying optimized files...");
  const applied: string[] = [];
  const conflicts: string[] = [];

  for (const change of pending.changes) {
    if (token.isCancellationRequested) return;

    const currentContent = (await readWorkspaceText(root.uri, change.path)) ?? "";
    if (hashContent(currentContent) !== change.oldHash) {
      conflicts.push(change.path);
      continue;
    }

    await ensureParentDirectory(root.uri, change.path);
    const targetUri = toWorkspaceUri(root.uri, change.path);
    await vscode.workspace.fs.writeFile(
      targetUri,
      Buffer.from(change.newContent, "utf-8"),
    );
    applied.push(change.path);
  }

  pendingApplyPlans.delete(workspaceKey);

  stream.markdown(`Applied ${applied.length} file(s).`);
  if (applied.length > 0) {
    stream.markdown(`\n\nUpdated: ${applied.map((file) => `\`${file}\``).join(", ")}`);
  }
  if (conflicts.length > 0) {
    stream.markdown(
      `\n\nSkipped due to changes since preview: ${conflicts.map((file) => `\`${file}\``).join(", ")}.\n` +
        "Run `/apply` again to generate a fresh diff.",
    );
  }
}

function addFileAnchors(
  stream: vscode.ChatResponseStream,
  files: ContextFile[],
): void {
  if (files.length === 0) return;
  const root = getWorkspaceRoot();
  if (!root) return;

  stream.markdown("\n\n**Quick links:** ");
  for (let i = 0; i < files.length; i++) {
    const uri = toWorkspaceUri(root.uri, files[i].path);
    stream.anchor(uri, files[i].path);
    if (i < files.length - 1) stream.markdown(" · ");
  }
  stream.markdown("\n");
}

async function handleInit(
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) {
    stream.markdown("No workspace folder open. Open a project first.");
    return;
  }

  const rootUri = root.uri;

  const targetPath = ".github/copilot-instructions.md";
  try {
    await vscode.workspace.fs.stat(toWorkspaceUri(rootUri, targetPath));
    stream.markdown(
      `\`${targetPath}\` already exists. Use \`@context-optimizer /audit\` to analyze it, or \`@context-optimizer /optimize\` to improve it.`,
    );
    return;
  } catch {
    // File doesn't exist — continue with scaffolding
  }

  let projectName = root.name;
  let projectDescription = "";
  let stack = "";
  let scripts: Record<string, string> = {};

  try {
    const pkgRaw = await vscode.workspace.fs.readFile(
      toWorkspaceUri(rootUri, "package.json"),
    );
    const pkg = JSON.parse(Buffer.from(pkgRaw).toString("utf-8"));
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
    if (deps.some((d) => d.includes("tailwind"))) frameworks.push("Tailwind CSS");
    stack = frameworks.join(", ") || "Node.js";
  } catch {
    try {
      await vscode.workspace.fs.stat(toWorkspaceUri(rootUri, "pyproject.toml"));
      stack = "Python";
    } catch {
      try {
        await vscode.workspace.fs.stat(toWorkspaceUri(rootUri, "Cargo.toml"));
        stack = "Rust";
      } catch {
        try {
          await vscode.workspace.fs.stat(toWorkspaceUri(rootUri, "go.mod"));
          stack = "Go";
        } catch {
          stack = "Unknown";
        }
      }
    }
  }

  if (token.isCancellationRequested) return;

  const essentialCommands: string[] = [];
  const commandMap: Record<string, string> = {
    dev: "Development server",
    build: "Build project",
    compile: "Compile project",
    test: "Run tests",
    lint: "Run linter",
    start: "Start application",
  };
  for (const [key, desc] of Object.entries(commandMap)) {
    if (scripts[key]) {
      essentialCommands.push(`- \`npm run ${key}\` — ${desc}`);
    }
  }

  const lines: string[] = [
    "# Copilot Instructions",
    "",
    "## Project",
    projectDescription ? `${projectName} — ${projectDescription}` : projectName,
    "",
    "## Stack",
    stack,
    "",
    "## Rules",
    "1. Always ask before making breaking changes",
    "2. Follow existing code patterns — check the source files before proposing changes",
    "3. Be concise and specific",
    "",
  ];

  if (essentialCommands.length > 0) {
    lines.push("## Commands", ...essentialCommands, "");
  }

  const content = lines.join("\n");
  stream.markdown(
    "## Generated `copilot-instructions.md`\n\n" +
      `\`\`\`markdown\n${content}\`\`\`\n\n` +
      `**${content.split("\n").length} lines** — well within the ~80-line auto-loaded budget.\n\n` +
      "To create this file, copy the above content to `.github/copilot-instructions.md`.\n\n" +
      "Then run `@context-optimizer /audit` to verify your context setup.",
  );
}

export function deactivate() {}

