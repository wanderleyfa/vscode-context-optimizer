import * as assert from "node:assert";
import { describe, it } from "node:test";
import { getMessages, resolveLocale } from "../i18n";
import { lintContextFiles } from "../linter";
import type { ContextFile } from "../prompts";
import { buildAuditReport } from "../report";
import {
  buildApplyPreviewReport,
  formatAuditToolPayload,
  generateInitInstructions,
} from "../tools";

function makeFile(
  overrides: Partial<ContextFile> & { path: string },
): ContextFile {
  return {
    lines: 100,
    content: "# Rules\n" + "line\n".repeat(99),
    cost: "HIGH",
    tool: "Copilot",
    loading: "Every interaction",
    ...overrides,
  };
}

describe("resolveLocale", () => {
  it("normalizes VS Code language codes to en, pt-br, or es", () => {
    assert.strictEqual(resolveLocale("pt-br"), "pt-br");
    assert.strictEqual(resolveLocale("pt-BR"), "pt-br");
    assert.strictEqual(resolveLocale("pt"), "pt-br");
    assert.strictEqual(resolveLocale("es"), "es");
    assert.strictEqual(resolveLocale("es-ES"), "es");
    assert.strictEqual(resolveLocale("es-419"), "es");
    assert.strictEqual(resolveLocale("en"), "en");
    assert.strictEqual(resolveLocale("en-US"), "en");
    assert.strictEqual(resolveLocale("fr"), "en");
    assert.strictEqual(resolveLocale(undefined), "en");
  });
});

describe("localized buildAuditReport", () => {
  it("renders audit report in Portuguese (pt-br) when locale is pt-br", () => {
    const files = [makeFile({ path: ".github/copilot-instructions.md", lines: 120 })];
    const report = buildAuditReport(files, 80, undefined, "pt-br");
    assert.ok(report.includes("## Relatório de Auditoria de Contexto de IA"));
    assert.ok(report.includes("AUTO-CARREGADO (a cada sessão)"));
    assert.ok(report.includes("Recomendações"));
  });

  it("renders audit report in Spanish (es) when locale is es", () => {
    const files = [makeFile({ path: ".github/copilot-instructions.md", lines: 120 })];
    const report = buildAuditReport(files, 80, undefined, "es");
    assert.ok(report.includes("## Informe de Auditoría de Contexto de IA"));
    assert.ok(report.includes("CARGADO AUTOMÁTICAMENTE (cada sesión)"));
    assert.ok(report.includes("Recomendaciones"));
  });
});

describe("localized lintContextFiles", () => {
  it("returns lint warnings in the requested VS Code locale", () => {
    const files: ContextFile[] = [
      makeFile({
        path: ".github/instructions/api.instructions.md",
        lines: 10,
        content: "# No frontmatter",
        cost: "LOW",
      }),
    ];

    const ptIssues = lintContextFiles(files, { threshold: 80, locale: "pt-br" });
    assert.ok(ptIssues[0].message.includes("applyTo"));
    assert.ok(ptIssues[0].message.includes("ausente") || ptIssues[0].message.includes("sem"));

    const esIssues = lintContextFiles(files, { threshold: 80, locale: "es" });
    assert.ok(esIssues[0].message.includes("applyTo"));
    assert.ok(esIssues[0].message.includes("falta") || esIssues[0].message.includes("sin"));
  });
});

describe("localized tools output", () => {
  it("localizes empty audit payload, init template, and apply preview", () => {
    const emptyPt = formatAuditToolPayload([], 80, true, "pt-br");
    assert.ok(emptyPt.includes("Nenhum arquivo de contexto de IA encontrado"));

    const initEs = generateInitInstructions(
      { workspaceName: "demo-app", hasGoMod: true },
      "es",
    );
    assert.ok(initEs.includes("## Proyecto"));
    assert.ok(initEs.includes("## Reglas"));

    const previewPt = buildApplyPreviewReport(
      "Resumo",
      [
        {
          path: ".github/copilot-instructions.md",
          oldContent: "",
          newContent: "# Novo",
        },
      ],
      8,
      "pt-br",
    );
    assert.ok(previewPt.markdown.includes("Criar"));

    const msgs = getMessages("pt-br");
    assert.ok(msgs.statusBarZeroFiles.includes("0 arquivos"));
  });
});
