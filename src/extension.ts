import * as vscode from "vscode";
import { SYSTEM_PROMPT } from "./prompts";
import { discoverContextFiles, buildAuditReport } from "./scanner";

const PARTICIPANT_ID = "context-optimizer.agent";

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
  const command = request.command;
  const userPrompt = request.prompt;

  // Always run the scanner first
  stream.progress("Scanning workspace for AI context files...");
  const files = await discoverContextFiles(token);

  if (files.length === 0) {
    stream.markdown(
      "No AI context files found in this workspace. Nothing to optimize.",
    );
    return;
  }

  // Build the audit report
  const auditReport = buildAuditReport(files);

  if (command === "audit") {
    // Audit only — just show the report (no need to keep file contents in memory)
    stream.markdown(auditReport);
    return;
  }

  // For optimize/compare/free-form, use the LM to generate recommendations
  const models = await vscode.lm.selectChatModels({});
  const model = models[0];

  if (!model) {
    // Fallback: just show the audit report
    stream.markdown(auditReport);
    stream.markdown(
      "\n\n*No language model available for detailed analysis. Showing audit report only.*",
    );
    return;
  }

  // Include actual file contents for HIGH/MEDIUM files so the model can give specific advice
  // Truncate content to avoid exceeding LM context window limits
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

  const messages = [
    vscode.LanguageModelChatMessage.User(SYSTEM_PROMPT),
    vscode.LanguageModelChatMessage.User(
      `Here is the audit report for this workspace:\n\n${auditReport}\n\n` +
        `File inventory:\n${files.map((f) => `- ${f.path}: ${f.lines} lines (${f.cost})`).join("\n")}\n\n` +
        (fileContents
          ? `File contents (HIGH and MEDIUM cost):\n\n${fileContents}\n\n`
          : "") +
        getModeInstruction(command, userPrompt),
    ),
  ];

  const response = await model.sendRequest(messages, {}, token);

  for await (const chunk of response.text) {
    stream.markdown(chunk);
  }
};

function getModeInstruction(
  command: string | undefined,
  userPrompt: string,
): string {
  switch (command) {
    case "optimize":
      return "Analyze the audit report and provide SPECIFIC file-by-file optimization recommendations. For each HIGH-cost file over 80 lines, show exactly what sections to extract into scoped .instructions.md files with applyTo patterns. Show the projected before/after line counts.";
    case "compare":
      return "Show a detailed before/after comparison of what the optimized files would look like. Include projected line counts and reduction percentages. Do NOT actually make changes.";
    default:
      return (
        userPrompt ||
        "Analyze this audit report. Identify the biggest optimization opportunities. Provide specific, actionable recommendations ordered by impact. If auto-loaded context exceeds 80 lines, explain exactly how to reduce it."
      );
  }
}

export function deactivate() {}
