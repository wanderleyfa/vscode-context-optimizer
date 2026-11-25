export type SupportedLocale = "en" | "pt-br" | "es";

export function resolveLocale(rawLanguage?: string): SupportedLocale {
  if (!rawLanguage) return "en";
  const lower = rawLanguage.trim().toLowerCase();
  if (lower.startsWith("pt")) return "pt-br";
  if (lower.startsWith("es")) return "es";
  return "en";
}

export interface LocaleMessages {
  auditTitle: string;
  summaryTitle: string;
  metricCol: string;
  linesCol: string;
  tokensCol: string;
  autoLoadedRow: string;
  mediumRow: string;
  scopedRow: string;
  lazyRow: string;
  totalRow: string;
  inventoryTitle: string;
  fileCol: string;
  costCol: string;
  toolCol: string;
  loadingCol: string;
  recommendationsTitle: string;
  compactGlobalRec: (lines: number, tokens: string, threshold: number) => string;
  deduplicateRec: (count: number, files: string) => string;
  similarityTitle: string;
  fileACol: string;
  fileBCol: string;
  similarityCol: string;
  similarityNote: string;
  wellOptimizedTitle: string;
  wellOptimizedBody: (lines: number, tokens: string, threshold: number) => string;
  duplicateSectionsTitle: string;
  headingCol: string;
  filesCol: string;
  lintWarningsTitle: string;
  noContextFilesFound: string;
  applyPreviewTitle: string;
  actionCol: string;
  actionCreate: string;
  actionUpdate: string;
  noChangesProposed: string;
  initProjectHeading: string;
  initStackHeading: string;
  initRulesHeading: string;
  initRulesList: string[];
  initCommandsHeading: string;
  initCommandDescriptions: Record<string, string>;
  statusBarZeroFiles: string;
  statusBarZeroTooltip: string;
  statusBarTooltipOver: (lines: number, threshold: number) => string;
  statusBarTooltipOk: (lines: number, threshold: number, count: number) => string;
  codeLensTooltip: string;
  lintThresholdExceeded: (lines: number, threshold: number) => string;
  lintMissingApplyTo: string;
  lintMissingSkillFrontmatter: string;
  lintMissingSkillDescription: string;
  lintSkillNameMismatch: (name: string, folder: string) => string;
  lintStalePath: (refPath: string) => string;
  lintStaleScript: (scriptName: string) => string;
  lintDuplicateHeading: (heading: string, files: string) => string;
  lintTooManyMcpServers: (count: number) => string;
  quickFixApplyToTitle: string;
  quickFixSkillNameTitle: (folder: string) => string;
  quickFixSkillFrontmatterTitle: string;
  noWorkspaceOpen: string;
  allToolsSynced: string;
  quickLinksLabel: string;
  auditNextSteps: string;
}

const EN_MESSAGES: LocaleMessages = {
  auditTitle: "AI Context Audit Report",
  summaryTitle: "Summary",
  metricCol: "Metric",
  linesCol: "Lines",
  tokensCol: "~Tokens",
  autoLoadedRow: "AUTO-LOADED (every session)",
  mediumRow: "Medium (conditional)",
  scopedRow: "Scoped (applyTo)",
  lazyRow: "Lazy (on-demand)",
  totalRow: "Total",
  inventoryTitle: "Inventory",
  fileCol: "File",
  costCol: "Cost",
  toolCol: "Tool",
  loadingCol: "Loading",
  recommendationsTitle: "⚠️ Recommendations",
  compactGlobalRec: (lines, tokens, threshold) =>
    `1. **Compact global file** — ${lines} auto-loaded lines (~${tokens} tokens) exceeds the ~${threshold}-line target. Move details to scoped \`.instructions.md\` files.\n`,
  deduplicateRec: (count, files) =>
    `2. **Deduplicate** — ${count} HIGH-cost files detected. Check for overlapping content between: ${files}.\n`,
  similarityTitle: "🔁 Content Similarity",
  fileACol: "File A",
  fileBCol: "File B",
  similarityCol: "Similarity",
  similarityNote:
    "> Files with high similarity likely contain duplicated instructions. Consider creating a single source of truth.",
  wellOptimizedTitle: "✅ Context is well-optimized",
  wellOptimizedBody: (lines, tokens, threshold) =>
    `Auto-loaded context (${lines} lines, ~${tokens} tokens) is within the ~${threshold}-line target.`,
  duplicateSectionsTitle: "📑 Duplicate Sections Across HIGH-Cost Files",
  headingCol: "Heading",
  filesCol: "Files",
  lintWarningsTitle: "🔍 Context Lint Warnings",
  noContextFilesFound:
    "No AI context files found in this workspace. Nothing to optimize.\n\n" +
    "Add context files like `.github/copilot-instructions.md`, `CLAUDE.md`, or `.cursorrules` to get started.",
  applyPreviewTitle: "## /apply preview (no files changed yet)\n\n",
  actionCol: "Action",
  actionCreate: "Create",
  actionUpdate: "Update",
  noChangesProposed:
    "No file changes were proposed (or all proposed contents already match your workspace).",
  initProjectHeading: "## Project",
  initStackHeading: "## Stack",
  initRulesHeading: "## Rules",
  initRulesList: [
    "1. Always ask before making breaking changes",
    "2. Follow existing code patterns — check the source files before proposing changes",
    "3. Be concise and specific",
  ],
  initCommandsHeading: "## Commands",
  initCommandDescriptions: {
    dev: "Development server",
    build: "Build project",
    compile: "Compile project",
    test: "Run tests",
    lint: "Run linter",
    start: "Start application",
  },
  statusBarZeroFiles: "$(sparkle) AI Context: 0 files",
  statusBarZeroTooltip:
    "No AI context files found. Click to view AI Context Audit Report.",
  statusBarTooltipOver: (lines, threshold) =>
    `Auto-loaded context (${lines} lines) exceeds ~${threshold}-line target. Click to open Audit Report.`,
  statusBarTooltipOk: (lines, threshold, count) =>
    `Auto-loaded context is well-optimized (${lines}/${threshold} lines, ${count} total files). Click to open Audit Report.`,
  codeLensTooltip: "Click to open full AI Context Audit Report",
  lintThresholdExceeded: (lines, threshold) =>
    `Auto-loaded context file has ${lines} lines (exceeds ~${threshold}-line target). Move domain details to scoped .instructions.md files.`,
  lintMissingApplyTo:
    "Scoped .instructions.md file is missing YAML frontmatter with `applyTo` glob pattern.",
  lintMissingSkillFrontmatter:
    "SKILL.md is missing required YAML frontmatter (`name` and `description`).",
  lintMissingSkillDescription:
    "SKILL.md frontmatter is missing `description` (required for on-demand skill activation).",
  lintSkillNameMismatch: (name, folder) =>
    `SKILL.md frontmatter name "${name}" does not match parent folder "${folder}". VS Code requires an exact match.`,
  lintStalePath: (refPath) =>
    `Referenced path \`${refPath}\` was not found in the workspace.`,
  lintStaleScript: (scriptName) =>
    `Referenced script \`npm run ${scriptName}\` is not defined in package.json.`,
  lintDuplicateHeading: (heading, files) =>
    `Section heading "## ${heading}" is duplicated across HIGH-cost files (${files}).`,
  lintTooManyMcpServers: (count) =>
    `${count} MCP servers configured. Each active MCP server injects tool schemas into the context window; consider disabling unused servers.`,
  quickFixApplyToTitle: 'Add `applyTo: "**/*"` frontmatter',
  quickFixSkillNameTitle: (folder) => `Set skill name to "${folder}"`,
  quickFixSkillFrontmatterTitle: "Add required SKILL.md frontmatter",
  noWorkspaceOpen: "No workspace folder open. Open a project first.",
  allToolsSynced: "All AI tool context files are already synchronized.",
  quickLinksLabel: "**Quick links:** ",
  auditNextSteps:
    "\n\n---\n*Next steps: `/optimize` for recommendations, `/compare` for projection, `/sync` to unify tools, or `/apply` to preview executable changes.*",
};

const PT_BR_MESSAGES: LocaleMessages = {
  auditTitle: "Relatório de Auditoria de Contexto de IA",
  summaryTitle: "Resumo",
  metricCol: "Métrica",
  linesCol: "Linhas",
  tokensCol: "~Tokens",
  autoLoadedRow: "AUTO-CARREGADO (a cada sessão)",
  mediumRow: "Médio (condicional)",
  scopedRow: "Escopo (applyTo)",
  lazyRow: "Lazy (sob demanda)",
  totalRow: "Total",
  inventoryTitle: "Inventário",
  fileCol: "Arquivo",
  costCol: "Custo",
  toolCol: "Ferramenta",
  loadingCol: "Carregamento",
  recommendationsTitle: "⚠️ Recomendações",
  compactGlobalRec: (lines, tokens, threshold) =>
    `1. **Compactar arquivo global** — ${lines} linhas auto-carregadas (~${tokens} tokens) excedem a meta de ~${threshold} linhas. Mova detalhes para arquivos \`.instructions.md\` com escopo.\n`,
  deduplicateRec: (count, files) =>
    `2. **Desduplicar** — ${count} arquivos de custo HIGH detectados. Verifique conteúdo sobreposto entre: ${files}.\n`,
  similarityTitle: "🔁 Similaridade de Conteúdo",
  fileACol: "Arquivo A",
  fileBCol: "Arquivo B",
  similarityCol: "Similaridade",
  similarityNote:
    "> Arquivos com alta similaridade provavelmente contêm instruções duplicadas. Considere criar uma única fonte da verdade.",
  wellOptimizedTitle: "✅ O contexto está bem otimizado",
  wellOptimizedBody: (lines, tokens, threshold) =>
    `O contexto auto-carregado (${lines} linhas, ~${tokens} tokens) está dentro da meta de ~${threshold} linhas.`,
  duplicateSectionsTitle: "📑 Seções Duplicadas Entre Arquivos de Custo HIGH",
  headingCol: "Seção",
  filesCol: "Arquivos",
  lintWarningsTitle: "🔍 Avisos de Lint de Contexto",
  noContextFilesFound:
    "Nenhum arquivo de contexto de IA encontrado neste workspace. Nada para otimizar.\n\n" +
    "Adicione arquivos como `.github/copilot-instructions.md`, `CLAUDE.md` ou `.cursorrules` para começar.",
  applyPreviewTitle: "## Preview do /apply (nenhum arquivo alterado ainda)\n\n",
  actionCol: "Ação",
  actionCreate: "Criar",
  actionUpdate: "Atualizar",
  noChangesProposed:
    "Nenhuma alteração de arquivo foi proposta (ou os conteúdos propostos já correspondem ao seu workspace).",
  initProjectHeading: "## Projeto",
  initStackHeading: "## Stack",
  initRulesHeading: "## Regras",
  initRulesList: [
    "1. Sempre pergunte antes de fazer alterações quebráveis (breaking changes)",
    "2. Siga os padrões de código existentes — verifique os arquivos-fonte antes de propor mudanças",
    "3. Seja conciso e específico",
  ],
  initCommandsHeading: "## Comandos",
  initCommandDescriptions: {
    dev: "Servidor de desenvolvimento",
    build: "Build do projeto",
    compile: "Compilar projeto",
    test: "Executar testes",
    lint: "Executar linter",
    start: "Iniciar aplicação",
  },
  statusBarZeroFiles: "$(sparkle) Contexto IA: 0 arquivos",
  statusBarZeroTooltip:
    "Nenhum arquivo de contexto de IA encontrado. Clique para abrir o Relatório de Auditoria.",
  statusBarTooltipOver: (lines, threshold) =>
    `Contexto auto-carregado (${lines} linhas) excede a meta de ~${threshold} linhas. Clique para abrir o Relatório de Auditoria.`,
  statusBarTooltipOk: (lines, threshold, count) =>
    `Contexto auto-carregado bem otimizado (${lines}/${threshold} linhas, ${count} arquivos no total). Clique para abrir o Relatório de Auditoria.`,
  codeLensTooltip: "Clique para abrir o Relatório de Auditoria de Contexto de IA",
  lintThresholdExceeded: (lines, threshold) =>
    `Arquivo auto-carregado possui ${lines} linhas (excede a meta de ~${threshold} linhas). Mova detalhes para arquivos .instructions.md com escopo.`,
  lintMissingApplyTo:
    "Arquivo .instructions.md com escopo está com frontmatter `applyTo` ausente.",
  lintMissingSkillFrontmatter:
    "SKILL.md está com frontmatter YAML obrigatório (`name` e `description`) ausente.",
  lintMissingSkillDescription:
    "Frontmatter do SKILL.md está com `description` ausente (obrigatório para ativação sob demanda).",
  lintSkillNameMismatch: (name, folder) =>
    `O nome "${name}" no frontmatter do SKILL.md não corresponde à pasta pai "${folder}". O VS Code exige correspondência exata.`,
  lintStalePath: (refPath) =>
    `O caminho referenciado \`${refPath}\` não foi encontrado no workspace.`,
  lintStaleScript: (scriptName) =>
    `O script referenciado \`npm run ${scriptName}\` não está definido no package.json.`,
  lintDuplicateHeading: (heading, files) =>
    `A seção "## ${heading}" está duplicada entre arquivos de custo HIGH (${files}).`,
  lintTooManyMcpServers: (count) =>
    `${count} servidores MCP configurados. Cada servidor MCP ativo injeta schemas de ferramentas na janela de contexto; considere desativar servidores não utilizados.`,
  quickFixApplyToTitle: 'Adicionar frontmatter `applyTo: "**/*"`',
  quickFixSkillNameTitle: (folder) => `Corrigir nome da skill para "${folder}"`,
  quickFixSkillFrontmatterTitle: "Adicionar frontmatter obrigatório no SKILL.md",
  noWorkspaceOpen: "Nenhuma pasta de workspace aberta. Abra um projeto primeiro.",
  allToolsSynced: "Todos os arquivos de contexto de IA já estão sincronizados.",
  quickLinksLabel: "**Links rápidos:** ",
  auditNextSteps:
    "\n\n---\n*Próximos passos: `/optimize` para recomendações, `/compare` para projeção, `/sync` para unificar ferramentas ou `/apply` para visualizar alterações executáveis.*",
};

const ES_MESSAGES: LocaleMessages = {
  auditTitle: "Informe de Auditoría de Contexto de IA",
  summaryTitle: "Resumen",
  metricCol: "Métrica",
  linesCol: "Líneas",
  tokensCol: "~Tokens",
  autoLoadedRow: "CARGADO AUTOMÁTICAMENTE (cada sesión)",
  mediumRow: "Medio (condicional)",
  scopedRow: "Alcance (applyTo)",
  lazyRow: "Lazy (bajo demanda)",
  totalRow: "Total",
  inventoryTitle: "Inventario",
  fileCol: "Archivo",
  costCol: "Costo",
  toolCol: "Herramienta",
  loadingCol: "Carga",
  recommendationsTitle: "⚠️ Recomendaciones",
  compactGlobalRec: (lines, tokens, threshold) =>
    `1. **Compactar archivo global** — ${lines} líneas autocargadas (~${tokens} tokens) exceden el límite de ~${threshold} líneas. Mueva los detalles a archivos \`.instructions.md\` con alcance.\n`,
  deduplicateRec: (count, files) =>
    `2. **Desduplicar** — ${count} archivos de costo HIGH detectados. Verifique el contenido superpuesto entre: ${files}.\n`,
  similarityTitle: "🔁 Similitud de Contenido",
  fileACol: "Archivo A",
  fileBCol: "Archivo B",
  similarityCol: "Similitud",
  similarityNote:
    "> Los archivos con alta similitud probablemente contienen instrucciones duplicadas. Considere crear una única fuente de verdad.",
  wellOptimizedTitle: "✅ El contexto está bien optimizado",
  wellOptimizedBody: (lines, tokens, threshold) =>
    `El contexto autocargado (${lines} líneas, ~${tokens} tokens) está dentro del objetivo de ~${threshold} líneas.`,
  duplicateSectionsTitle: "📑 Secciones Duplicadas Entre Archivos de Costo HIGH",
  headingCol: "Sección",
  filesCol: "Archivos",
  lintWarningsTitle: "🔍 Advertencias de Lint de Contexto",
  noContextFilesFound:
    "No se encontraron archivos de contexto de IA en este workspace. Nada que optimizar.\n\n" +
    "Agregue archivos como `.github/copilot-instructions.md`, `CLAUDE.md` o `.cursorrules` para comenzar.",
  applyPreviewTitle: "## Vista previa de /apply (ningún archivo modificado aún)\n\n",
  actionCol: "Acción",
  actionCreate: "Crear",
  actionUpdate: "Actualizar",
  noChangesProposed:
    "No se propusieron cambios de archivos (o los contenidos propuestos ya coinciden con su workspace).",
  initProjectHeading: "## Proyecto",
  initStackHeading: "## Stack",
  initRulesHeading: "## Reglas",
  initRulesList: [
    "1. Pregunte siempre antes de realizar cambios disruptivos (breaking changes)",
    "2. Siga los patrones de código existentes — revise los archivos fuente antes de proponer cambios",
    "3. Sea conciso y específico",
  ],
  initCommandsHeading: "## Comandos",
  initCommandDescriptions: {
    dev: "Servidor de desarrollo",
    build: "Compilar proyecto (build)",
    compile: "Compilar proyecto",
    test: "Ejecutar pruebas",
    lint: "Ejecutar linter",
    start: "Iniciar aplicación",
  },
  statusBarZeroFiles: "$(sparkle) Contexto IA: 0 archivos",
  statusBarZeroTooltip:
    "No se encontraron archivos de contexto de IA. Haga clic para ver el Informe de Auditoría.",
  statusBarTooltipOver: (lines, threshold) =>
    `El contexto autocargado (${lines} líneas) excede el límite de ~${threshold} líneas. Haga clic para abrir el Informe de Auditoría.`,
  statusBarTooltipOk: (lines, threshold, count) =>
    `El contexto autocargado está bien optimizado (${lines}/${threshold} líneas, ${count} archivos en total). Haga clic para abrir el Informe de Auditoría.`,
  codeLensTooltip: "Haga clic para abrir el Informe de Auditoría de Contexto de IA",
  lintThresholdExceeded: (lines, threshold) =>
    `El archivo de contexto autocargado tiene ${lines} líneas (excede el límite de ~${threshold} líneas). Mueva los detalles a archivos .instructions.md con alcance.`,
  lintMissingApplyTo:
    "Al archivo .instructions.md con alcance le falta el frontmatter YAML con el patrón `applyTo`.",
  lintMissingSkillFrontmatter:
    "A SKILL.md le falta el frontmatter YAML obligatorio (`name` y `description`).",
  lintMissingSkillDescription:
    "Al frontmatter de SKILL.md le falta `description` (obligatorio para la activación bajo demanda).",
  lintSkillNameMismatch: (name, folder) =>
    `El nombre "${name}" en el frontmatter de SKILL.md no coincide con la carpeta padre "${folder}". VS Code requiere coincidencia exacta.`,
  lintStalePath: (refPath) =>
    `La ruta referenciada \`${refPath}\` no se encontró en el workspace.`,
  lintStaleScript: (scriptName) =>
    `El script referenciado \`npm run ${scriptName}\` no está definido en package.json.`,
  lintDuplicateHeading: (heading, files) =>
    `El encabezado de sección "## ${heading}" está duplicado entre archivos de costo HIGH (${files}).`,
  lintTooManyMcpServers: (count) =>
    `${count} servidores MCP configurados. Cada servidor MCP activo inyecta esquemas de herramientas en la ventana de contexto; considere desactivar los que no utilice.`,
  quickFixApplyToTitle: 'Agregar frontmatter `applyTo: "**/*"`',
  quickFixSkillNameTitle: (folder) => `Cambiar nombre de la skill a "${folder}"`,
  quickFixSkillFrontmatterTitle: "Agregar frontmatter obligatorio a SKILL.md",
  noWorkspaceOpen: "No hay carpeta de workspace abierta. Abra un proyecto primero.",
  allToolsSynced: "Todos los archivos de contexto de IA ya están sincronizados.",
  quickLinksLabel: "**Enlaces rápidos:** ",
  auditNextSteps:
    "\n\n---\n*Próximos pasos: `/optimize` para recomendaciones, `/compare` para proyección, `/sync` para unificar herramientas o `/apply` para previsualizar cambios ejecutables.*",
};

const MESSAGES_BY_LOCALE: Record<SupportedLocale, LocaleMessages> = {
  en: EN_MESSAGES,
  "pt-br": PT_BR_MESSAGES,
  es: ES_MESSAGES,
};

export function getMessages(rawLanguage?: string): LocaleMessages {
  return MESSAGES_BY_LOCALE[resolveLocale(rawLanguage)];
}
