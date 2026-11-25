import { posix as path } from "node:path";
import * as vscode from "vscode";
import {
  hashContent,
  isApplyConfirmation,
  isSafeRelativePath,
  parseApplyPlan,
} from "./apply";
import { getMessages, resolveLocale, type SupportedLocale } from "./i18n";
import {
  buildCrossToolSyncPlan,
  buildQuickFixContent,
  extractReferencedPaths,
  lintContextFiles,
  type ContextLintIssue,
  type LintIssueCode,
} from "./linter";
import { SYSTEM_PROMPT, type ContextFile } from "./prompts";
import { buildAuditReport, estimateTokens, getModeInstruction } from "./report";
import { discoverContextFiles } from "./scanner";
import {
  TOOL_NAMES,
  buildApplyPreviewReport,
  buildFileContentsForModel,
  formatAuditToolPayload,
  generateInitInstructions,
  type PackageJsonMetadata,
  type ProjectInitMetadata,
  type ProposedFileChange,
  type ValidatedFileChange,
} from "./tools";

const PARTICIPANT_ID = "context-optimizer.agent";
const APPLY_PLAN_TTL_MS = 15 * 60 * 1000;

export const COMMAND_NAMES = {
  SHOW_AUDIT: "contextOptimizer.showAuditReport",
  INIT_INSTRUCTIONS: "contextOptimizer.initInstructions",
  SYNC_TOOLS: "contextOptimizer.syncTools",
} as const;

interface PendingApplyPlan {
  createdAt: number;
  summary: string;
  changes: ValidatedFileChange[];
}

interface AuditToolInput {
  includeContents?: boolean;
  threshold?: number;
}

interface InitToolInput {
  writeIfMissing?: boolean;
}

interface ApplyToolFileInput {
  path: string;
  content: string;
  reason?: string;
}

interface ApplyToolInput {
  summary?: string;
  files?: ApplyToolFileInput[];
  confirm?: boolean;
}

interface SyncToolInput {
  confirm?: boolean;
}

const pendingApplyPlans = new Map<string, PendingApplyPlan>();

function getUiLocale(): SupportedLocale {
  return resolveLocale(vscode.env?.language);
}

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

async function fileExists(
  rootUri: vscode.Uri,
  relativePath: string,
): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(toWorkspaceUri(rootUri, relativePath));
    return true;
  } catch {
    return false;
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

async function collectProjectInitMetadata(
  root: vscode.WorkspaceFolder,
): Promise<ProjectInitMetadata> {
  const pkgText = await readWorkspaceText(root.uri, "package.json");
  if (pkgText) {
    try {
      const packageJson = JSON.parse(pkgText) as PackageJsonMetadata;
      return { workspaceName: root.name, packageJson };
    } catch {
      // Fallback to marker file detection if package.json is invalid JSON
    }
  }

  const [hasPyprojectToml, hasCargoToml, hasGoMod] = await Promise.all([
    fileExists(root.uri, "pyproject.toml"),
    fileExists(root.uri, "Cargo.toml"),
    fileExists(root.uri, "go.mod"),
  ]);

  return {
    workspaceName: root.name,
    hasPyprojectToml,
    hasCargoToml,
    hasGoMod,
  };
}

async function collectWorkspaceLintIssues(
  files: ContextFile[],
  threshold: number,
  locale: SupportedLocale,
): Promise<ContextLintIssue[]> {
  const root = getWorkspaceRoot();
  if (!root) {
    return lintContextFiles(files, { threshold, locale });
  }

  const allReferencedPaths = new Set<string>();
  for (const file of files) {
    for (const refPath of extractReferencedPaths(file.content)) {
      allReferencedPaths.add(refPath);
    }
  }

  const existingPaths = new Set<string>();
  await Promise.all(
    [...allReferencedPaths].map(async (refPath) => {
      if (await fileExists(root.uri, refPath)) {
        existingPaths.add(refPath);
      }
    }),
  );

  let availableScripts: Set<string> | undefined;
  const pkgText = await readWorkspaceText(root.uri, "package.json");
  if (pkgText) {
    try {
      const pkg = JSON.parse(pkgText) as PackageJsonMetadata;
      if (pkg.scripts) {
        availableScripts = new Set(Object.keys(pkg.scripts));
      }
    } catch {
      // Ignore malformed package.json
    }
  }

  return lintContextFiles(files, {
    threshold,
    existingPaths,
    availableScripts,
    locale,
  });
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
  const locale = getUiLocale();
  if (locale === "pt-br") {
    return (
      "## AI Context Optimizer\n\n" +
      "| Skill / Comando | Referência Tool | Descrição |\n|---|---|---|\n" +
      "| `/context-audit` ou `@context-optimizer /audit` | `#contextAudit` | Relatório de auditoria com custos de token e lint |\n" +
      "| `/context-optimize` ou `@context-optimizer /optimize` | `#contextAudit` | Plano detalhado de otimização arquivo por arquivo |\n" +
      "| `/context-compare` ou `@context-optimizer /compare` | `#contextAudit` | Projeção antes/depois sem alterar arquivos |\n" +
      "| `/context-apply` ou `@context-optimizer /apply` | `#contextApply` | Preview de diffs e aplicação com confirmação explícita |\n" +
      "| `/context-sync` ou `@context-optimizer /sync` | `#contextSync` | Sincroniza instruções entre Copilot, Claude, Gemini e AGENTS.md |\n" +
      "| `/context-init` ou `@context-optimizer /init` | `#contextInit` | Cria arquivo de contexto a partir dos metadados do projeto |\n" +
      "| `/context-help` ou `@context-optimizer /help` | — | Mostra esta ajuda |\n\n" +
      "**Custom Agent:** Selecione **Context Optimizer** no seletor de agentes do Copilot Chat.\n\n" +
      "**Configurações:**\n" +
      "- `contextOptimizer.autoLoadedLineThreshold` — máximo recomendado de linhas para arquivos auto-carregados (padrão: 80)\n" +
      "- `contextOptimizer.maxFilesPerPattern` — máximo de arquivos por padrão de busca (padrão: 1000)\n" +
      "- `contextOptimizer.excludeGlob` — diretórios excluídos da varredura\n"
    );
  }
  if (locale === "es") {
    return (
      "## AI Context Optimizer\n\n" +
      "| Skill / Comando | Referencia Tool | Descripción |\n|---|---|---|\n" +
      "| `/context-audit` o `@context-optimizer /audit` | `#contextAudit` | Informe de auditoría con costos de tokens y lint |\n" +
      "| `/context-optimize` o `@context-optimizer /optimize` | `#contextAudit` | Plan detallado de optimización archivo por archivo |\n" +
      "| `/context-compare` o `@context-optimizer /compare` | `#contextAudit` | Proyección antes/después sin modificar archivos |\n" +
      "| `/context-apply` o `@context-optimizer /apply` | `#contextApply` | Vista previa de diffs y aplicación con confirmación explícita |\n" +
      "| `/context-sync` o `@context-optimizer /sync` | `#contextSync` | Sincroniza instrucciones entre Copilot, Claude, Gemini y AGENTS.md |\n" +
      "| `/context-init` o `@context-optimizer /init` | `#contextInit` | Crea archivos de contexto desde los metadatos del proyecto |\n" +
      "| `/context-help` o `@context-optimizer /help` | — | Muestra esta ayuda |\n\n" +
      "**Custom Agent:** Seleccione **Context Optimizer** en el selector de agentes de Copilot Chat.\n\n" +
      "**Configuración:**\n" +
      "- `contextOptimizer.autoLoadedLineThreshold` — máximo recomendado de líneas para archivos autocargados (predeterminado: 80)\n" +
      "- `contextOptimizer.maxFilesPerPattern` — máximo de archivos por patrón de búsqueda (predeterminado: 1000)\n" +
      "- `contextOptimizer.excludeGlob` — directorios excluidos del escaneo\n"
    );
  }
  return (
    "## AI Context Optimizer\n\n" +
    "| Skill / Command | Tool Reference | Description |\n|---|---|---|\n" +
    "| `/context-audit` or `@context-optimizer /audit` | `#contextAudit` | Read-only audit report with token costs & lint checks |\n" +
    "| `/context-optimize` or `@context-optimizer /optimize` | `#contextAudit` | Detailed file-by-file optimization plan |\n" +
    "| `/context-compare` or `@context-optimizer /compare` | `#contextAudit` | Before/after projection without applying changes |\n" +
    "| `/context-apply` or `@context-optimizer /apply` | `#contextApply` | Preview diffs and apply with explicit confirmation |\n" +
    "| `/context-sync` or `@context-optimizer /sync` | `#contextSync` | Synchronize instructions across Copilot, Claude, Gemini & AGENTS.md |\n" +
    "| `/context-init` or `@context-optimizer /init` | `#contextInit` | Scaffold context files from project metadata |\n" +
    "| `/context-help` or `@context-optimizer /help` | — | Show this help |\n\n" +
    "**Custom Agent:** Select **Context Optimizer** from the Copilot Chat agent dropdown for an ongoing specialist role.\n\n" +
    "**Command Palette (`⌘⇧P` / `Ctrl+Shift+P`):**\n" +
    "- `AI Context Optimizer: Show Audit Report`\n" +
    "- `AI Context Optimizer: Initialize Copilot Instructions`\n" +
    "- `AI Context Optimizer: Synchronize AI Context Files`\n\n" +
    "**Settings:**\n" +
    "- `contextOptimizer.autoLoadedLineThreshold` — max recommended lines for auto-loaded files (default: 80)\n" +
    "- `contextOptimizer.maxFilesPerPattern` — max matches per scan pattern (default: 1000)\n" +
    "- `contextOptimizer.excludeGlob` — directories excluded from scan\n"
  );
}

class AuditContextTool implements vscode.LanguageModelTool<AuditToolInput> {
  prepareInvocation(): vscode.PreparedToolInvocation {
    return {
      invocationMessage: "Scanning workspace for AI context files...",
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<AuditToolInput>,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const locale = getUiLocale();
    const files = await discoverContextFiles(token);
    const threshold = options.input?.threshold ?? getThreshold();
    const includeContents = options.input?.includeContents ?? true;
    const payload = formatAuditToolPayload(
      files,
      threshold,
      includeContents,
      locale,
    );
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(payload),
    ]);
  }
}

class InitContextTool implements vscode.LanguageModelTool<InitToolInput> {
  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<InitToolInput>,
  ): vscode.PreparedToolInvocation {
    if (options.input?.writeIfMissing) {
      return {
        invocationMessage:
          "Scaffolding .github/copilot-instructions.md from project metadata...",
        confirmationMessages: {
          title: "Create .github/copilot-instructions.md",
          message: new vscode.MarkdownString(
            "Create `.github/copilot-instructions.md` using detected project metadata?",
          ),
        },
      };
    }
    return {
      invocationMessage: "Analyzing project structure for context scaffolding...",
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<InitToolInput>,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const locale = getUiLocale();
    const msg = getMessages(locale);
    const root = getWorkspaceRoot();
    if (!root) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(msg.noWorkspaceOpen),
      ]);
    }

    const targetPath = ".github/copilot-instructions.md";
    if (await fileExists(root.uri, targetPath)) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          `\`${targetPath}\` already exists. Run \`#contextAudit\` to analyze it or optimize existing files.`,
        ),
      ]);
    }

    if (token.isCancellationRequested) {
      return new vscode.LanguageModelToolResult([]);
    }

    const meta = await collectProjectInitMetadata(root);
    const content = generateInitInstructions(meta, locale);

    if (options.input?.writeIfMissing) {
      await ensureParentDirectory(root.uri, targetPath);
      await vscode.workspace.fs.writeFile(
        toWorkspaceUri(root.uri, targetPath),
        Buffer.from(content, "utf-8"),
      );
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          `Created \`${targetPath}\` (${content.split("\n").length} lines).\n\n\`\`\`markdown\n${content}\`\`\``,
        ),
      ]);
    }

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(
        `## Generated \`${targetPath}\`\n\n\`\`\`markdown\n${content}\`\`\`\n\n` +
          `**${content.split("\n").length} lines** — within the ~${getThreshold()}-line auto-loaded budget.`,
      ),
    ]);
  }
}

class ApplyContextTool implements vscode.LanguageModelTool<ApplyToolInput> {
  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ApplyToolInput>,
  ): vscode.PreparedToolInvocation {
    if (options.input?.confirm) {
      const fileList =
        options.input.files
          ?.map((f) => `- \`${f.path}\``)
          .join("\n") || "pending previewed files";
      return {
        invocationMessage: "Applying optimized AI context files...",
        confirmationMessages: {
          title: "Apply Optimized Context Files",
          message: new vscode.MarkdownString(
            `Write the following optimized context files to the workspace?\n\n${fileList}`,
          ),
        },
      };
    }
    return {
      invocationMessage: "Building unified diff preview for context optimization...",
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ApplyToolInput>,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const locale = getUiLocale();
    const msg = getMessages(locale);
    const root = getWorkspaceRoot();
    const workspaceKey = getWorkspaceKey();
    if (!root || !workspaceKey) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(msg.noWorkspaceOpen),
      ]);
    }

    const inputFiles = options.input?.files ?? [];
    const summary =
      options.input?.summary ||
      "Optimization plan generated for workspace AI context files.";

    if (inputFiles.length > 0) {
      const proposed: ProposedFileChange[] = [];
      for (const file of inputFiles.slice(0, 8)) {
        if (token.isCancellationRequested) {
          return new vscode.LanguageModelToolResult([]);
        }
        const normalizedPath = file.path.replace(/\\/g, "/");
        if (!isSafeRelativePath(normalizedPath)) continue;
        const oldContent =
          (await readWorkspaceText(root.uri, normalizedPath)) ?? "";
        proposed.push({
          path: normalizedPath,
          oldContent,
          newContent: file.content,
          reason: file.reason,
        });
      }

      const preview = buildApplyPreviewReport(summary, proposed, 8, locale);
      if (preview.changes.length === 0) {
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(preview.markdown),
        ]);
      }

      pendingApplyPlans.set(workspaceKey, {
        createdAt: Date.now(),
        summary,
        changes: preview.changes,
      });

      if (!options.input?.confirm) {
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(
            `${preview.markdown}\nAsk the user for confirmation before calling \`#contextApply\` with \`confirm: true\`.`,
          ),
        ]);
      }
    }

    if (options.input?.confirm) {
      const resultText = await executePendingPlan(root.uri, workspaceKey, token);
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(resultText),
      ]);
    }

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(
        "Provide `files` to preview an optimization plan, or `confirm: true` to apply a pending preview.",
      ),
    ]);
  }
}

class SyncContextTool implements vscode.LanguageModelTool<SyncToolInput> {
  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<SyncToolInput>,
  ): vscode.PreparedToolInvocation {
    if (options.input?.confirm) {
      return {
        invocationMessage: "Synchronizing AI context files across tools...",
        confirmationMessages: {
          title: "Synchronize AI Context Files",
          message: new vscode.MarkdownString(
            "Write synchronized context files (`AGENTS.md`, `.github/copilot-instructions.md`, `CLAUDE.md`) to the workspace?",
          ),
        },
      };
    }
    return {
      invocationMessage: "Building cross-tool synchronization plan...",
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<SyncToolInput>,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const locale = getUiLocale();
    const msg = getMessages(locale);
    const root = getWorkspaceRoot();
    const workspaceKey = getWorkspaceKey();
    if (!root || !workspaceKey) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(msg.noWorkspaceOpen),
      ]);
    }

    const files = await discoverContextFiles(token);
    const syncPlan = buildCrossToolSyncPlan(files);
    if (syncPlan.files.length === 0) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(syncPlan.summary),
      ]);
    }

    const proposed: ProposedFileChange[] = [];
    for (const file of syncPlan.files) {
      const oldContent = (await readWorkspaceText(root.uri, file.path)) ?? "";
      proposed.push({
        path: file.path,
        oldContent,
        newContent: file.content,
        reason: file.reason,
      });
    }

    const preview = buildApplyPreviewReport(
      syncPlan.summary,
      proposed,
      8,
      locale,
    );
    if (preview.changes.length === 0) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(msg.allToolsSynced),
      ]);
    }

    pendingApplyPlans.set(workspaceKey, {
      createdAt: Date.now(),
      summary: syncPlan.summary,
      changes: preview.changes,
    });

    if (options.input?.confirm) {
      const resultText = await executePendingPlan(root.uri, workspaceKey, token);
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(resultText),
      ]);
    }

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(
        `${preview.markdown}\nAsk the user for confirmation before calling \`#contextSync\` with \`confirm: true\`.`,
      ),
    ]);
  }
}

class ContextCodeLensProvider implements vscode.CodeLensProvider {
  private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
  private cachedFiles = new Map<string, ContextFile>();

  updateFiles(files: ContextFile[]): void {
    this.cachedFiles.clear();
    for (const file of files) {
      this.cachedFiles.set(file.path, file);
    }
    this._onDidChangeCodeLenses.fire();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const rel = vscode.workspace.asRelativePath(document.uri);
    const file = this.cachedFiles.get(rel);
    if (!file) return [];

    const locale = getUiLocale();
    const msg = getMessages(locale);
    const tokens = estimateTokens(file.lines, file.content);
    const threshold = getThreshold();
    const statusIcon =
      file.cost === "HIGH" && file.lines > threshold ? "⚠️" : "✨";
    const range = new vscode.Range(0, 0, 0, 0);

    return [
      new vscode.CodeLens(range, {
        title: `${statusIcon} AI Context (${file.tool}): ${file.lines} ${msg.linesCol.toLowerCase()} · ~${tokens.toLocaleString()} tokens · ${file.cost} (${file.loading})`,
        command: COMMAND_NAMES.SHOW_AUDIT,
        tooltip: msg.codeLensTooltip,
      }),
    ];
  }
}

class ContextQuickFixProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
  ];

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    const rel = vscode.workspace.asRelativePath(document.uri);
    const parentDir = path.basename(path.dirname(rel));
    const msg = getMessages(getUiLocale());

    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source !== "AI Context Optimizer") continue;
      const code = String(diagnostic.code ?? "") as LintIssueCode;
      const newText = buildQuickFixContent(rel, document.getText(), code);
      if (!newText) continue;

      let title = msg.quickFixSkillFrontmatterTitle;
      if (code === "MISSING_APPLY_TO") {
        title = msg.quickFixApplyToTitle;
      } else if (code === "SKILL_NAME_MISMATCH") {
        title = msg.quickFixSkillNameTitle(parentDir);
      }

      const action = new vscode.CodeAction(
        title,
        vscode.CodeActionKind.QuickFix,
      );
      action.diagnostics = [diagnostic];
      action.isPreferred = true;

      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(document.getText().length),
      );
      edit.replace(document.uri, fullRange, newText);
      action.edit = edit;
      actions.push(action);
    }

    return actions;
  }
}

export function activate(context: vscode.ExtensionContext) {
  setupLiveWorkspaceMonitor(context);

  if (typeof vscode.lm?.registerTool === "function") {
    for (const [name, tool] of [
      [TOOL_NAMES.AUDIT, new AuditContextTool()],
      [TOOL_NAMES.INIT, new InitContextTool()],
      [TOOL_NAMES.APPLY, new ApplyContextTool()],
      [TOOL_NAMES.SYNC, new SyncContextTool()],
    ] as const) {
      try {
        context.subscriptions.push(vscode.lm.registerTool(name, tool));
      } catch {
        // Ignore tool registration errors in older or restricted hosts
      }
    }
  }

  if (typeof vscode.chat?.createChatParticipant === "function") {
    try {
      const participant = vscode.chat.createChatParticipant(
        PARTICIPANT_ID,
        handler,
      );
      participant.iconPath = new vscode.ThemeIcon("sparkle");
      context.subscriptions.push(participant);
    } catch {
      // Ignore deprecated chat participant registration errors in Copilot harness
    }
  }
}

function setupLiveWorkspaceMonitor(context: vscode.ExtensionContext): void {
  if (!vscode.window?.createStatusBarItem) return;

  const statusBarItem = vscode.window.createStatusBarItem(
    "contextOptimizer.statusBar",
    vscode.StatusBarAlignment.Left,
    50,
  );
  statusBarItem.name = "AI Context Optimizer";
  statusBarItem.command = COMMAND_NAMES.SHOW_AUDIT;
  statusBarItem.text = "$(sparkle) AI Context...";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  const diagnostics =
    vscode.languages?.createDiagnosticCollection?.("contextOptimizer");
  if (diagnostics) {
    context.subscriptions.push(diagnostics);
  }

  const codeLensProvider = new ContextCodeLensProvider();
  if (vscode.languages?.registerCodeLensProvider) {
    context.subscriptions.push(
      vscode.languages.registerCodeLensProvider(
        { scheme: "file" },
        codeLensProvider,
      ),
    );
  }

  if (vscode.languages?.registerCodeActionsProvider) {
    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(
        { scheme: "file" },
        new ContextQuickFixProvider(),
        {
          providedCodeActionKinds:
            ContextQuickFixProvider.providedCodeActionKinds,
        },
      ),
    );
  }

  const refreshWorkspaceState = async (): Promise<void> => {
    const locale = getUiLocale();
    const msg = getMessages(locale);
    const root = getWorkspaceRoot();
    if (!root) {
      statusBarItem.text = msg.statusBarZeroFiles;
      statusBarItem.tooltip = msg.noWorkspaceOpen;
      statusBarItem.backgroundColor = undefined;
      statusBarItem.show();
      diagnostics?.clear();
      return;
    }

    const files = await discoverContextFiles();
    codeLensProvider.updateFiles(files);

    if (files.length === 0) {
      statusBarItem.text = msg.statusBarZeroFiles;
      statusBarItem.tooltip = msg.statusBarZeroTooltip;
      statusBarItem.backgroundColor = undefined;
      statusBarItem.show();
      diagnostics?.clear();
      return;
    }

    const threshold = getThreshold();
    const highFiles = files.filter((f) => f.cost === "HIGH");
    const autoLoadedLines = highFiles.reduce((sum, f) => sum + f.lines, 0);
    const autoLoadedTokens = highFiles.reduce(
      (sum, f) => sum + estimateTokens(f.lines, f.content),
      0,
    );

    const issues = await collectWorkspaceLintIssues(files, threshold, locale);
    const overBudget = autoLoadedLines > threshold;

    statusBarItem.text = overBudget
      ? `$(warning) AI Context: ${autoLoadedLines}L (~${autoLoadedTokens.toLocaleString()} tok)`
      : `$(sparkle) AI Context: ${autoLoadedLines}L (~${autoLoadedTokens.toLocaleString()} tok)`;
    statusBarItem.tooltip = overBudget
      ? msg.statusBarTooltipOver(autoLoadedLines, threshold)
      : msg.statusBarTooltipOk(autoLoadedLines, threshold, files.length);
    statusBarItem.backgroundColor = overBudget
      ? new vscode.ThemeColor("statusBarItem.warningBackground")
      : undefined;
    statusBarItem.show();

    if (diagnostics) {
      diagnostics.clear();
      const byFile = new Map<string, vscode.Diagnostic[]>();
      for (const issue of issues) {
        const lineIndex = Math.max(0, issue.line - 1);
        const range = new vscode.Range(lineIndex, 0, lineIndex, 120);
        const diag = new vscode.Diagnostic(
          range,
          issue.message,
          issue.severity === "warning"
            ? vscode.DiagnosticSeverity.Warning
            : vscode.DiagnosticSeverity.Information,
        );
        diag.source = "AI Context Optimizer";
        diag.code = issue.code;
        const list = byFile.get(issue.file) ?? [];
        list.push(diag);
        byFile.set(issue.file, list);
      }

      for (const [relPath, fileDiagnostics] of byFile.entries()) {
        diagnostics.set(toWorkspaceUri(root.uri, relPath), fileDiagnostics);
      }
    }
  };

  if (vscode.commands?.registerCommand) {
    context.subscriptions.push(
      vscode.commands.registerCommand(COMMAND_NAMES.SHOW_AUDIT, async () => {
        const locale = getUiLocale();
        const msg = getMessages(locale);
        const files = await discoverContextFiles();
        const threshold = getThreshold();
        const issues = await collectWorkspaceLintIssues(
          files,
          threshold,
          locale,
        );
        const report =
          files.length === 0
            ? msg.noContextFilesFound
            : buildAuditReport(files, threshold, issues, locale);
        const doc = await vscode.workspace.openTextDocument({
          content: report,
          language: "markdown",
        });
        await vscode.window.showTextDocument(doc, { preview: true });
      }),
      vscode.commands.registerCommand(
        COMMAND_NAMES.INIT_INSTRUCTIONS,
        async () => {
          const root = getWorkspaceRoot();
          if (!root) return;
          const locale = getUiLocale();
          const targetPath = ".github/copilot-instructions.md";
          if (await fileExists(root.uri, targetPath)) {
            const doc = await vscode.workspace.openTextDocument(
              toWorkspaceUri(root.uri, targetPath),
            );
            await vscode.window.showTextDocument(doc);
            return;
          }
          const meta = await collectProjectInitMetadata(root);
          const content = generateInitInstructions(meta, locale);
          await ensureParentDirectory(root.uri, targetPath);
          const targetUri = toWorkspaceUri(root.uri, targetPath);
          await vscode.workspace.fs.writeFile(
            targetUri,
            Buffer.from(content, "utf-8"),
          );
          const doc = await vscode.workspace.openTextDocument(targetUri);
          await vscode.window.showTextDocument(doc);
          await refreshWorkspaceState();
        },
      ),
      vscode.commands.registerCommand(COMMAND_NAMES.SYNC_TOOLS, async () => {
        const root = getWorkspaceRoot();
        if (!root) return;
        const locale = getUiLocale();
        const files = await discoverContextFiles();
        const syncPlan = buildCrossToolSyncPlan(files);
        const proposed: ProposedFileChange[] = [];
        for (const file of syncPlan.files) {
          const oldContent =
            (await readWorkspaceText(root.uri, file.path)) ?? "";
          proposed.push({
            path: file.path,
            oldContent,
            newContent: file.content,
            reason: file.reason,
          });
        }
        const preview = buildApplyPreviewReport(
          syncPlan.summary,
          proposed,
          8,
          locale,
        );
        const doc = await vscode.workspace.openTextDocument({
          content: preview.markdown,
          language: "markdown",
        });
        await vscode.window.showTextDocument(doc, { preview: true });
      }),
    );
  }

  if (vscode.workspace?.onDidSaveTextDocument) {
    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument(() => {
        void refreshWorkspaceState();
      }),
    );
  }
  if (vscode.workspace?.onDidChangeConfiguration) {
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("contextOptimizer")) {
          void refreshWorkspaceState();
        }
      }),
    );
  }
  if (vscode.workspace?.onDidChangeWorkspaceFolders) {
    context.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        void refreshWorkspaceState();
      }),
    );
  }

  void refreshWorkspaceState();
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
      `\n\n**Error:** ${message}\n\nPlease try again or run \`/context-audit\` for a basic report.`,
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
  const locale = getUiLocale();
  const msg = getMessages(locale);

  if (command === "help") {
    stream.markdown(buildHelpMarkdown());
    return;
  }

  if (command === "init") {
    stream.progress("Analyzing project structure...");
    await handleInit(stream, token, locale);
    return;
  }

  if (
    (command === "apply" || command === "sync") &&
    isApplyConfirmation(userPrompt)
  ) {
    await applyPendingPlan(stream, token);
    return;
  }

  stream.progress("Scanning workspace for AI context files...");
  const files = await discoverContextFiles(token);

  if (files.length === 0) {
    stream.markdown(msg.noContextFilesFound);
    return;
  }

  const threshold = getThreshold();
  const lintIssues = await collectWorkspaceLintIssues(files, threshold, locale);
  const auditReport = buildAuditReport(files, threshold, lintIssues, locale);

  if (command === "audit") {
    stream.markdown(auditReport);
    addFileAnchors(stream, files, locale);
    stream.markdown(msg.auditNextSteps);
    return;
  }

  if (command === "sync") {
    await previewSyncPlan(files, stream, token, locale);
    return;
  }

  if (command === "apply") {
    await previewApplyPlan(files, auditReport, chatContext, stream, token, locale);
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
    locale,
  );
}

async function previewSyncPlan(
  files: ContextFile[],
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
  locale: SupportedLocale,
): Promise<void> {
  const msg = getMessages(locale);
  const root = getWorkspaceRoot();
  const workspaceKey = getWorkspaceKey();
  if (!root || !workspaceKey) {
    stream.markdown(msg.noWorkspaceOpen);
    return;
  }

  const syncPlan = buildCrossToolSyncPlan(files);
  if (syncPlan.files.length === 0) {
    stream.markdown(syncPlan.summary);
    return;
  }

  const proposed: ProposedFileChange[] = [];
  for (const file of syncPlan.files) {
    if (token.isCancellationRequested) return;
    const oldContent = (await readWorkspaceText(root.uri, file.path)) ?? "";
    proposed.push({
      path: file.path,
      oldContent,
      newContent: file.content,
      reason: file.reason,
    });
  }

  const preview = buildApplyPreviewReport(
    syncPlan.summary,
    proposed,
    8,
    locale,
  );
  if (preview.changes.length === 0) {
    stream.markdown(msg.allToolsSynced);
    return;
  }

  pendingApplyPlans.set(workspaceKey, {
    createdAt: Date.now(),
    summary: syncPlan.summary,
    changes: preview.changes,
  });

  stream.markdown(preview.markdown);
  stream.markdown(
    "\nRun `@context-optimizer /apply confirm` (or `#contextSync` with `confirm: true`) to write these files.",
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
  locale: SupportedLocale,
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
        getModeInstruction(command, userPrompt, threshold, locale),
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
  locale: SupportedLocale,
): Promise<void> {
  const msg = getMessages(locale);
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
    stream.markdown(msg.noWorkspaceOpen);
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

  const proposed: ProposedFileChange[] = [];
  for (const planned of parsedPlan.files.slice(0, 8)) {
    if (token.isCancellationRequested) return;
    const oldContent = (await readWorkspaceText(root.uri, planned.path)) ?? "";
    proposed.push({
      path: planned.path,
      oldContent,
      newContent: planned.content,
      reason: planned.reason,
    });
  }

  const preview = buildApplyPreviewReport(
    parsedPlan.summary,
    proposed,
    8,
    locale,
  );
  if (preview.changes.length === 0) {
    stream.markdown(preview.markdown);
    return;
  }

  pendingApplyPlans.set(workspaceKey, {
    createdAt: Date.now(),
    summary: parsedPlan.summary,
    changes: preview.changes,
  });

  stream.markdown(preview.markdown);
  stream.markdown(
    "\nRun `@context-optimizer /apply confirm` to write these files. " +
      `This preview expires in ${Math.floor(APPLY_PLAN_TTL_MS / 60000)} minutes.`,
  );
}

async function executePendingPlan(
  rootUri: vscode.Uri,
  workspaceKey: string,
  token: vscode.CancellationToken,
): Promise<string> {
  const pending = pendingApplyPlans.get(workspaceKey);
  if (!pending) {
    return "No pending preview found. Run `/apply` (or `#contextApply` without confirm) first to generate a preview before confirming.";
  }

  if (Date.now() - pending.createdAt > APPLY_PLAN_TTL_MS) {
    pendingApplyPlans.delete(workspaceKey);
    return "The previous `/apply` preview expired. Run `/apply` again to generate a fresh plan.";
  }

  const applied: string[] = [];
  const conflicts: string[] = [];

  for (const change of pending.changes) {
    if (token.isCancellationRequested) break;

    const currentContent =
      (await readWorkspaceText(rootUri, change.path)) ?? "";
    if (hashContent(currentContent) !== change.oldHash) {
      conflicts.push(change.path);
      continue;
    }

    await ensureParentDirectory(rootUri, change.path);
    const targetUri = toWorkspaceUri(rootUri, change.path);
    await vscode.workspace.fs.writeFile(
      targetUri,
      Buffer.from(change.newContent, "utf-8"),
    );
    applied.push(change.path);
  }

  pendingApplyPlans.delete(workspaceKey);

  const parts: string[] = [`Applied ${applied.length} file(s).`];
  if (applied.length > 0) {
    parts.push(
      `\n\nUpdated: ${applied.map((file) => `\`${file}\``).join(", ")}`,
    );
  }
  if (conflicts.length > 0) {
    parts.push(
      `\n\nSkipped due to changes since preview: ${conflicts.map((file) => `\`${file}\``).join(", ")}.\n` +
        "Run `/apply` again to generate a fresh diff.",
    );
  }

  return parts.join("");
}

async function applyPendingPlan(
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<void> {
  const locale = getUiLocale();
  const msg = getMessages(locale);
  const root = getWorkspaceRoot();
  const workspaceKey = getWorkspaceKey();
  if (!root || !workspaceKey) {
    stream.markdown(msg.noWorkspaceOpen);
    return;
  }

  stream.progress("Applying optimized files...");
  const message = await executePendingPlan(root.uri, workspaceKey, token);
  stream.markdown(message);
}

function addFileAnchors(
  stream: vscode.ChatResponseStream,
  files: ContextFile[],
  locale: SupportedLocale,
): void {
  if (files.length === 0) return;
  const root = getWorkspaceRoot();
  if (!root) return;

  const msg = getMessages(locale);
  stream.markdown(`\n\n${msg.quickLinksLabel}`);
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
  locale: SupportedLocale,
): Promise<void> {
  const msg = getMessages(locale);
  const root = getWorkspaceRoot();
  if (!root) {
    stream.markdown(msg.noWorkspaceOpen);
    return;
  }

  const targetPath = ".github/copilot-instructions.md";
  if (await fileExists(root.uri, targetPath)) {
    stream.markdown(
      `\`${targetPath}\` already exists. Use \`/context-audit\` or \`@context-optimizer /audit\` to analyze it, or \`/context-optimize\` to improve it.`,
    );
    return;
  }

  const meta = await collectProjectInitMetadata(root);
  if (token.isCancellationRequested) return;

  const content = generateInitInstructions(meta, locale);
  stream.markdown(
    "## Generated `copilot-instructions.md`\n\n" +
      `\`\`\`markdown\n${content}\`\`\`\n\n` +
      `**${content.split("\n").length} lines** — well within the ~80-line auto-loaded budget.\n\n` +
      "To create this file, copy the above content to `.github/copilot-instructions.md`.\n\n" +
      "Then run `/context-audit` to verify your context setup.",
  );
}

export function deactivate() {}
