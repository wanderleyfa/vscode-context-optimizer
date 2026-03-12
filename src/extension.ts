import * as vscode from "vscode";
import { SYSTEM_PROMPT } from "./prompts";
import { discoverContextFiles } from "./scanner";
import { buildAuditReport, getModeInstruction } from "./report";
import type { ContextFile } from "./prompts";

const PARTICIPANT_ID = "context-optimizer.agent";

function getThreshold(): number {
  return vscode.workspace
    .getConfiguration("contextOptimizer")
    .get<number>("autoLoadedLineThreshold", 80);
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
  const userPrompt = request.prompt;

  // /help — show available commands
  if (command === "help") {
    stream.markdown(
      "## AI Context Optimizer\n\n" +
        "| Command | Description |\n|---|---|\n" +
        "| `@context-optimizer` | Scan & generate optimized files |\n" +
        "| `@context-optimizer /audit` | Read-only audit report with token costs |\n" +
        "| `@context-optimizer /optimize` | Detailed optimization plan |\n" +
        "| `@context-optimizer /compare` | Before/after projection |\n" +
        "| `@context-optimizer /init` | Scaffold context files from project |\n" +
        "| `@context-optimizer /help` | Show this help |\n\n" +
        "**Settings:** `contextOptimizer.autoLoadedLineThreshold` — max recommended lines for auto-loaded files (default: 80)\n",
    );
    return;
  }

  // /init — scaffold context files from project metadata
  if (command === "init") {
    stream.progress("Analyzing project structure...");
    return await handleInit(stream, token);
  }

  // Always run the scanner first
  stream.progress("Scanning workspace for AI context files...");
  const files = await discoverContextFiles(token);

  if (files.length === 0) {
    stream.markdown(
      "No AI context files found in this workspace. Nothing to optimize.\n\n" +
        "Add context files like `.github/copilot-instructions.md`, `CLAUDE.md`, or `.cursorrules` to get started.",
    );
    return;
  }

  // Build the audit report
  const threshold = getThreshold();
  const auditReport = buildAuditReport(files, threshold);

  if (command === "audit") {
    stream.markdown(auditReport);
    addFileAnchors(stream, files);
    stream.markdown(
      "\n\n---\n*Want to optimize? Try `/optimize` for a detailed plan or `/compare` for a before/after preview.*",
    );
    return;
  }

  // For optimize/compare/free-form, use the LM to generate recommendations
  const models = await vscode.lm.selectChatModels({});
  const model = models[0];

  if (!model) {
    stream.markdown(auditReport);
    stream.markdown(
      "\n\n*No language model available for detailed analysis. Showing audit report only.*",
    );
    return;
  }

  // Include actual file contents for HIGH/MEDIUM files so the model can give specific advice
  const MAX_CONTENT_CHARS = 20000;
  let charBudget = MAX_CONTENT_CHARS;
  const contentParts: string[] = [];
  for (const f of files.filter(
    (f) => f.cost === "HIGH" || f.cost === "MEDIUM",
  )) {
    if (charBudget <= 0) break;
    const truncated =
      f.content.length > charBudget
        ? f.content.slice(0, charBudget) + "\n... (truncated)"
        : f.content;
    charBudget -= truncated.length;
    contentParts.push(
      `### ${f.path} (${f.lines} lines, ${f.cost})\n\`\`\`\n${truncated}\n\`\`\``,
    );
  }
  const fileContents = contentParts.join("\n\n");

  // Build conversation history from previous turns
  const historyMessages = chatContext.history
    .filter(
      (turn): turn is vscode.ChatRequestTurn =>
        turn instanceof vscode.ChatRequestTurn,
    )
    .slice(-3)
    .map((turn) => turn.prompt)
    .filter(Boolean);

  const messages = [
    vscode.LanguageModelChatMessage.User(SYSTEM_PROMPT),
    ...(historyMessages.length > 0
      ? [
          vscode.LanguageModelChatMessage.User(
            `Previous conversation context:\n${historyMessages.map((m) => `- ${m}`).join("\n")}`,
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

function addFileAnchors(
  stream: vscode.ChatResponseStream,
  files: ContextFile[],
): void {
  if (files.length === 0) return;
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders?.[0]) return;

  stream.markdown("\n\n**Quick links:** ");
  for (let i = 0; i < files.length; i++) {
    const uri = vscode.Uri.joinPath(workspaceFolders[0].uri, files[i].path);
    stream.anchor(uri, files[i].path);
    if (i < files.length - 1) stream.markdown(" · ");
  }
  stream.markdown("\n");
}

async function handleInit(
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders?.[0]) {
    stream.markdown("No workspace folder open. Open a project first.");
    return;
  }

  const rootUri = workspaceFolders[0].uri;

  // Check if copilot-instructions already exists
  const targetPath = ".github/copilot-instructions.md";
  try {
    await vscode.workspace.fs.stat(vscode.Uri.joinPath(rootUri, targetPath));
    stream.markdown(
      `\`${targetPath}\` already exists. Use \`@context-optimizer /audit\` to analyze it, or \`@context-optimizer /optimize\` to improve it.`,
    );
    return;
  } catch {
    // File doesn't exist — continue with scaffolding
  }

  // Read project metadata
  let projectName = workspaceFolders[0].name;
  let projectDescription = "";
  let stack = "";
  let scripts: Record<string, string> = {};

  try {
    const pkgRaw = await vscode.workspace.fs.readFile(
      vscode.Uri.joinPath(rootUri, "package.json"),
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
    if (deps.some((d) => d.includes("tailwind")))
      frameworks.push("Tailwind CSS");
    stack = frameworks.join(", ") || "Node.js";
  } catch {
    // No package.json — try other indicators
    try {
      await vscode.workspace.fs.stat(
        vscode.Uri.joinPath(rootUri, "pyproject.toml"),
      );
      stack = "Python";
    } catch {
      try {
        await vscode.workspace.fs.stat(
          vscode.Uri.joinPath(rootUri, "Cargo.toml"),
        );
        stack = "Rust";
      } catch {
        try {
          await vscode.workspace.fs.stat(
            vscode.Uri.joinPath(rootUri, "go.mod"),
          );
          stack = "Go";
        } catch {
          stack = "Unknown";
        }
      }
    }
  }

  if (token.isCancellationRequested) return;

  // Build essential commands section
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

  // Generate the file
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
