**🌐 Languages:** [English](#english) | [Português Brasileiro](#pt-br) | [Español](#es)

---

# <a id="english"></a>AI Context Optimizer

> **Privacy & Security:** This extension runs entirely locally. It makes **zero network requests**, does not collect telemetry, does not persist any data outside the VS Code session, and does not access external APIs. File contents are read from the local filesystem via `vscode.workspace.fs` and, when analysis is requested (`/optimize`, `/compare`), are forwarded — truncated to a hard limit — exclusively to the VS Code Language Model API (`vscode.lm`), which routes to whichever model the user has configured. No data leaves the machine through this extension.

## What it does

AI Context Optimizer is a **VS Code Chat Participant** (`@context-optimizer`) that statically analyzes AI context files across 15+ tools — GitHub Copilot, Claude Code, Gemini, Cursor, Windsurf, Aider, Continue, Cline, Amazon Q, Tabnine, Cody, Augment, Sourcery, Devin, and SpecKit. It scans the workspace for instruction, rule, and configuration files that are auto-loaded by these tools, classifies each by **loading frequency** and **token cost** (HIGH / MEDIUM / LOW / FREE), and produces an audit report with line counts. For deeper analysis, it forwards the report and file contents (truncated) to the user's configured language model to generate specific, file-by-file optimization recommendations.

## The Problem

Every AI-powered coding session starts by loading context files (`copilot-instructions.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, etc.). If these files are bloated, duplicated, or poorly structured, you're paying extra tokens on **every single interaction** — before you even ask a question.

## Quick Start

> **1.** Open the Copilot Chat panel (`Ctrl+Shift+I` / `⌘⇧I`)
>
> **2.** Type `@context-optimizer` and press Enter
>
> **3.** The extension scans your workspace and returns an audit report instantly

### `/audit` — See What You're Spending

```
@context-optimizer /audit
```

Returns a full inventory of every AI context file in your workspace, classified by cost level with line counts. **Read-only** — nothing is changed.

### `/optimize` — Get a Fix Plan

```
@context-optimizer /optimize
```

Analyzes each HIGH-cost file and generates **specific recommendations**: which sections to extract into scoped `.instructions.md` files, what to deduplicate, and how to restructure for minimal auto-loaded tokens.

### `/compare` — Preview the Savings

```
@context-optimizer /compare
```

Shows a **before/after projection** with line counts and reduction percentages — without touching any file. Review the plan before committing to changes.

### `/apply` — Preview Diffs and Apply Safely

```
@context-optimizer /apply
@context-optimizer /apply confirm
```

Generates an executable optimization plan, shows per-file diffs, and only writes files after explicit confirmation.

### Free-form Questions

```
@context-optimizer why is my CLAUDE.md so expensive?
@context-optimizer how can I reduce copilot-instructions to under 60 lines?
```

Ask anything about your context files and get tailored analysis.

## Supported Files

| Tool                 | Files Detected                                                           |
| -------------------- | ------------------------------------------------------------------------ |
| **GitHub Copilot**   | `copilot-instructions.md`, `.instructions.md`, `.agent.md`, `.prompt.md` |
| **Claude Code**      | `CLAUDE.md`, `AGENTS.md`, `MEMORY.md`, `hooks.json`                      |
| **Gemini**           | `GEMINI.md`, `settings.json`                                             |
| **Cursor**           | `.cursorrules`, `.cursor/rules/*.mdc`                                    |
| **Windsurf**         | `.windsurfrules`                                                         |
| **Aider**            | `.aider.conf.yml`, `.aiderignore`                                        |
| **Continue.dev**     | `.continuerules`, `.continue/config.json`, `.continue/rules/*.md`        |
| **Cline**            | `.clinerules`, `.cline/settings.json`, `.cline/rules/*.md`               |
| **Amazon Q**         | `.q/rules/*.md`                                                          |
| **Tabnine**          | `.tabnine.json`                                                          |
| **Sourcegraph Cody** | `.cody/cody.json`, `.cody/rules/*.md`                                    |
| **Augment**          | `.augment/config.json`, `.augment/rules/*.md`                            |
| **Sourcery**         | `.sourcery.yaml`                                                         |
| **Devin**            | `.devin/guidelines.md`, `.devin/rules/*.md`                              |
| **SpecKit**          | `constitution.md`, templates                                             |

## Cost Classification

| Level         | Meaning                  | Impact                              |
| ------------- | ------------------------ | ----------------------------------- |
| 🔴 **HIGH**   | Loaded every interaction | Tokens spent on every message       |
| 🟡 **MEDIUM** | Loaded conditionally     | Tokens spent in specific modes      |
| 🟢 **LOW**    | Scoped with `applyTo`    | Tokens spent only on matching files |
| ⚪ **FREE**   | On-demand only           | Zero cost until explicitly invoked  |

## Commands

| Command                        | What it does                                                       |
| ------------------------------ | ------------------------------------------------------------------ |
| `@context-optimizer`           | Scan & generate optimized files directly                           |
| `@context-optimizer /audit`    | Read-only audit report with line counts, token estimates and costs |
| `@context-optimizer /optimize` | Detailed file-by-file optimization plan                            |
| `@context-optimizer /compare`  | Before/after projection without applying changes                   |
| `@context-optimizer /apply`    | Show diffs and apply optimized files with explicit confirmation    |
| `@context-optimizer /init`     | Scaffold context files from your project metadata                  |
| `@context-optimizer /help`     | Show available commands and usage                                  |

## Settings

| Setting                                    | Default | Description                                                                         |
| ------------------------------------------ | ------- | ----------------------------------------------------------------------------------- |
| `contextOptimizer.autoLoadedLineThreshold` | `80`    | Max recommended lines for auto-loaded files. Files exceeding this trigger warnings. |
| `contextOptimizer.maxFilesPerPattern`      | `1000`  | Max files matched by each scan pattern. Increase for large monorepos.              |
| `contextOptimizer.excludeGlob`             | `**/{node_modules,dist,build,.git,.next,.turbo,.pnpm-store}/**` | Glob used to exclude directories from scan. |

## Features

- **Content-aware token estimation** — token projection uses file content instead of fixed per-line multiplier
- **Content similarity detection** — flags HIGH-cost files with >40% overlap (Dice coefficient)
- **Clickable file links** — audit report includes anchors to open files directly
- **Safe apply mode** — `/apply` previews diffs and requires explicit confirmation before writing files
- **Project scaffolding** — `/init` reads `package.json`, `pyproject.toml`, `Cargo.toml`, or `go.mod` and generates a starter `copilot-instructions.md`
- **Configurable threshold** — adjust the auto-loaded line budget via settings

## Example Output

```
## AI Context Audit Report

### Summary
| Metric                         | Lines | ~Tokens |
|--------------------------------|-------|--------|
| AUTO-LOADED (every session)    | 142   | ~4,260 |
| Medium (conditional)           | 28    | ~840   |
| Scoped (applyTo)               | 0     | ~0     |
| Lazy (on-demand)               | 45    | ~1,350 |
| Total                          | 215   | ~6,450 |

⚠️ Auto-loaded context (142 lines, ~4,260 tokens) exceeds the ~80-line target.

### 🔁 Content Similarity
| File A                       | File B     | Similarity |
|------------------------------|------------|------------|
| copilot-instructions.md      | CLAUDE.md  | 67%        |
```

## Requirements

- VS Code 1.100+
- GitHub Copilot Chat extension (for the chat participant API)

## License

[MIT](LICENSE)

---

# <a id="pt-br"></a>🇧🇷 AI Context Optimizer

> **Privacidade & Segurança:** Esta extensão é executada inteiramente localmente. Faz **zero requisições de rede**, não coleta telemetria, não persiste nenhum dado fora da sessão do VS Code e não acessa APIs externas. Os conteúdos dos arquivos são lidos do sistema de arquivos local via `vscode.workspace.fs` e, quando análise é solicitada (`/optimize`, `/compare`), são encaminhados — truncados para um limite máximo — exclusivamente para a API de Modelo de Linguagem do VS Code (`vscode.lm`), que roteia para o modelo que o usuário configurou. Nenhum dado sai da máquina através desta extensão.

## O que faz

AI Context Optimizer é um **VS Code Chat Participant** (`@context-optimizer`) que analisa estaticamente arquivos de contexto de IA em 15+ ferramentas — GitHub Copilot, Claude Code, Gemini, Cursor, Windsurf, Aider, Continue, Cline, Amazon Q, Tabnine, Cody, Augment, Sourcery, Devin e SpecKit. Ele escaneia o workspace em busca de arquivos de instrução, regras e configuração que são auto-carregados por essas ferramentas, classifica cada um por **frequência de carregamento** e **custo de token** (HIGH / MEDIUM / LOW / FREE), e produz um relatório de auditoria com contagens de linhas. Para análise aprofundada, encaminha o relatório e conteúdos dos arquivos (truncados) para o modelo de linguagem configurado do usuário para gerar recomendações específicas de otimização arquivo por arquivo.

## O Problema

Toda sessão de codificação alimentada por IA começa carregando arquivos de contexto (`copilot-instructions.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, etc.). Se esses arquivos estão inchados, duplicados ou mal estruturados, você está pagando tokens extras em **toda e qualquer interação** — antes mesmo de fazer uma pergunta.

## Início Rápido

> **1.** Abra o painel Copilot Chat (`Ctrl+Shift+I` / `⌘⇧I`)
>
> **2.** Digite `@context-optimizer` e pressione Enter
>
> **3.** A extensão escaneia seu workspace e retorna um relatório de auditoria instantaneamente

### `/audit` — Veja o Que Você Está Gastando

```
@context-optimizer /audit
```

Retorna um inventário completo de todos os arquivos de contexto de IA em seu workspace, classificados por nível de custo com contagens de linhas. **Somente leitura** — nada é alterado.

### `/optimize` — Obtenha um Plano de Correção

```
@context-optimizer /optimize
```

Analisa cada arquivo de custo HIGH e gera **recomendações específicas**: quais seções extrair em arquivos `.instructions.md` escopo, o que desduplicar e como reestruturar para tokens auto-carregados mínimos.

### `/compare` — Visualize as Economias

```
@context-optimizer /compare
```

Mostra uma **projeção antes/depois** com contagens de linhas e percentuais de redução — sem tocar em nenhum arquivo. Analise o plano antes de se comprometer com as alterações.

### Perguntas em Formato Livre

```
@context-optimizer por que meu CLAUDE.md é tão caro?
@context-optimizer como posso reduzir copilot-instructions para menos de 60 linhas?
```

Faça qualquer pergunta sobre seus arquivos de contexto e obtenha análise personalizada.

## Arquivos Suportados

| Ferramenta           | Arquivos Detectados                                                      |
| -------------------- | ------------------------------------------------------------------------ |
| **GitHub Copilot**   | `copilot-instructions.md`, `.instructions.md`, `.agent.md`, `.prompt.md` |
| **Claude Code**      | `CLAUDE.md`, `AGENTS.md`, `MEMORY.md`, `hooks.json`                      |
| **Gemini**           | `GEMINI.md`, `settings.json`                                             |
| **Cursor**           | `.cursorrules`, `.cursor/rules/*.mdc`                                    |
| **Windsurf**         | `.windsurfrules`                                                         |
| **Aider**            | `.aider.conf.yml`, `.aiderignore`                                        |
| **Continue.dev**     | `.continuerules`, `.continue/config.json`, `.continue/rules/*.md`        |
| **Cline**            | `.clinerules`, `.cline/settings.json`, `.cline/rules/*.md`               |
| **Amazon Q**         | `.q/rules/*.md`                                                          |
| **Tabnine**          | `.tabnine.json`                                                          |
| **Sourcegraph Cody** | `.cody/cody.json`, `.cody/rules/*.md`                                    |
| **Augment**          | `.augment/config.json`, `.augment/rules/*.md`                            |
| **Sourcery**         | `.sourcery.yaml`                                                         |
| **Devin**            | `.devin/guidelines.md`, `.devin/rules/*.md`                              |
| **SpecKit**          | `constitution.md`, templates                                             |

## Classificação de Custo

| Nível         | Significado                | Impacto                                          |
| ------------- | -------------------------- | ------------------------------------------------ |
| 🔴 **HIGH**   | Carregado a cada interação | Tokens gastos em cada mensagem                   |
| 🟡 **MEDIUM** | Carregado condicionalmente | Tokens gastos em modos específicos               |
| 🟢 **LOW**    | Escopo com `applyTo`       | Tokens gastos apenas em arquivos correspondentes |
| ⚪ **FREE**   | Sob demanda apenas         | Zero custo até ser explicitamente invocado       |

## Comandos

| Comando                        | O que faz                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------ |
| `@context-optimizer`           | Escaneia e gera arquivos otimizados diretamente                                |
| `@context-optimizer /audit`    | Relatório de auditoria com contagens de linhas, estimativas de tokens e custos |
| `@context-optimizer /optimize` | Plano de otimização detalhado arquivo por arquivo                              |
| `@context-optimizer /compare`  | Projeção antes/depois sem aplicar alterações                                   |
| `@context-optimizer /apply`    | Mostra diffs e aplica arquivos com confirmação explícita                       |
| `@context-optimizer /init`     | Cria arquivos de contexto a partir dos metadados do projeto                    |
| `@context-optimizer /help`     | Mostra comandos disponíveis e uso                                              |

## Configurações

| Configuração                               | Padrão | Descrição                                                                                         |
| ------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------- |
| `contextOptimizer.autoLoadedLineThreshold` | `80`   | Máximo recomendado de linhas para arquivos auto-carregados. Arquivos que excedem disparam avisos. |
| `contextOptimizer.maxFilesPerPattern`      | `1000` | Máximo de arquivos por padrão de varredura. Aumente em monorepos grandes.                         |
| `contextOptimizer.excludeGlob`             | `**/{node_modules,dist,build,.git,.next,.turbo,.pnpm-store}/**` | Glob para excluir diretórios da varredura. |

## Funcionalidades

- **Estimativa de tokens orientada por conteúdo** — projeção baseada no conteúdo real dos arquivos
- **Detecção de similaridade** — identifica arquivos HIGH com >40% de sobreposição (coeficiente Dice)
- **Links clicáveis** — relatório de auditoria inclui âncoras para abrir arquivos diretamente
- **Modo de aplicação segura** — `/apply` mostra diffs e só grava após confirmação explícita
- **Scaffolding de projeto** — `/init` lê `package.json`, `pyproject.toml`, `Cargo.toml` ou `go.mod` e gera um `copilot-instructions.md` inicial
- **Limite configurável** — ajuste o orçamento de linhas auto-carregadas via configurações

## Exemplo de Saída

```
## Relatório de Auditoria de Contexto de IA

### Resumo
| Métrica                          | Linhas | ~Tokens |
|----------------------------------|--------|--------|
| AUTO-CARREGADO (a cada sessão)   | 142    | ~4.260 |
| Médio (condicional)              | 28     | ~840   |
| Escopo (applyTo)                 | 0      | ~0     |
| Lazy (sob demanda)               | 45     | ~1.350 |
| Total                            | 215    | ~6.450 |

⚠️ Contexto auto-carregado (142 linhas, ~4.260 tokens) excede o alvo de ~80 linhas.

### 🔁 Similaridade de Conteúdo
| Arquivo A                    | Arquivo B  | Similaridade |
|------------------------------|------------|-------------|
| copilot-instructions.md      | CLAUDE.md  | 67%          |
```

## Requisitos

- VS Code 1.100+
- Extensão GitHub Copilot Chat (para a API do chat participant)

## Licença

[MIT](LICENSE)

---

# <a id="es"></a>🇪🇸 AI Context Optimizer

> **Privacidad y Seguridad:** Esta extensión se ejecuta completamente localmente. Realiza **cero solicitudes de red**, no recopila telemetría, no persiste ningún dato fuera de la sesión de VS Code y no accede a APIs externas. Los contenidos de los archivos se leen del sistema de archivos local a través de `vscode.workspace.fs` y, cuando se solicita análisis (`/optimize`, `/compare`), se reenvían — truncados a un límite máximo — exclusivamente a la API del Modelo de Lenguaje de VS Code (`vscode.lm`), que enruta al modelo que el usuario ha configurado. Ningún dato sale de la máquina a través de esta extensión.

## Qué hace

AI Context Optimizer es un **Participante de Chat de VS Code** (`@context-optimizer`) que analiza estáticamente archivos de contexto de IA en 15+ herramientas — GitHub Copilot, Claude Code, Gemini, Cursor, Windsurf, Aider, Continue, Cline, Amazon Q, Tabnine, Cody, Augment, Sourcery, Devin y SpecKit. Escanea el workspace en busca de archivos de instrucción, reglas y configuración que se cargan automáticamente en estas herramientas, clasifica cada uno por **frecuencia de carga** y **costo de tokens** (HIGH / MEDIUM / LOW / FREE), y produce un informe de auditoría con recuentos de líneas. Para un análisis más profundo, reenvía el informe y contenidos de archivos (truncados) al modelo de lenguaje configurado del usuario para generar recomendaciones específicas de optimización archivo por archivo.

## El Problema

Cada sesión de codificación impulsada por IA comienza cargando archivos de contexto (`copilot-instructions.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, etc.). Si estos archivos están inflados, duplicados o mal estructurados, está pagando tokens adicionales en **cada interacción** — antes incluso de hacer una pregunta.

## Inicio Rápido

> **1.** Abra el panel de Chat de Copilot (`Ctrl+Shift+I` / `⌘⇧I`)
>
> **2.** Escriba `@context-optimizer` y presione Enter
>
> **3.** La extensión escanea su workspace y devuelve un informe de auditoría al instante

### `/audit` — Vea lo que está Gastando

```
@context-optimizer /audit
```

Devuelve un inventario completo de todos los archivos de contexto de IA en su workspace, clasificados por nivel de costo con recuentos de líneas. **Solo lectura** — nada se cambia.

### `/optimize` — Obtenga un Plan de Corrección

```
@context-optimizer /optimize
```

Analiza cada archivo de costo HIGH y genera **recomendaciones específicas**: qué secciones extraer en archivos `.instructions.md` con alcance, qué desduplicar y cómo reestructurar para tokens cargados automáticamente mínimos.

### `/compare` — Visualice los Ahorros

```
@context-optimizer /compare
```

Muestra una **proyección antes/después** con recuentos de líneas y porcentajes de reducción — sin tocar ningún archivo. Revise el plan antes de comprometerse con los cambios.

### Preguntas de Forma Libre

```
@context-optimizer ¿por qué mi CLAUDE.md es tan caro?
@context-optimizer ¿cómo puedo reducir copilot-instructions a menos de 60 líneas?
```

Haga cualquier pregunta sobre sus archivos de contexto y obtenga análisis personalizado.

## Archivos Compatibles

| Herramienta          | Archivos Detectados                                                      |
| -------------------- | ------------------------------------------------------------------------ |
| **GitHub Copilot**   | `copilot-instructions.md`, `.instructions.md`, `.agent.md`, `.prompt.md` |
| **Claude Code**      | `CLAUDE.md`, `AGENTS.md`, `MEMORY.md`, `hooks.json`                      |
| **Gemini**           | `GEMINI.md`, `settings.json`                                             |
| **Cursor**           | `.cursorrules`, `.cursor/rules/*.mdc`                                    |
| **Windsurf**         | `.windsurfrules`                                                         |
| **Aider**            | `.aider.conf.yml`, `.aiderignore`                                        |
| **Continue.dev**     | `.continuerules`, `.continue/config.json`, `.continue/rules/*.md`        |
| **Cline**            | `.clinerules`, `.cline/settings.json`, `.cline/rules/*.md`               |
| **Amazon Q**         | `.q/rules/*.md`                                                          |
| **Tabnine**          | `.tabnine.json`                                                          |
| **Sourcegraph Cody** | `.cody/cody.json`, `.cody/rules/*.md`                                    |
| **Augment**          | `.augment/config.json`, `.augment/rules/*.md`                            |
| **Sourcery**         | `.sourcery.yaml`                                                         |
| **Devin**            | `.devin/guidelines.md`, `.devin/rules/*.md`                              |
| **SpecKit**          | `constitution.md`, templates                                             |

## Clasificación de Costos

| Nivel         | Significado                 | Impacto                                       |
| ------------- | --------------------------- | --------------------------------------------- |
| 🔴 **HIGH**   | Cargado en cada interacción | Tokens gastados en cada mensaje               |
| 🟡 **MEDIUM** | Cargado condicionalmente    | Tokens gastados en modos específicos          |
| 🟢 **LOW**    | Alcance con `applyTo`       | Tokens gastados solo en archivos coincidentes |
| ⚪ **FREE**   | Solo bajo demanda           | Cero costo hasta ser invocado explícitamente  |

## Comandos

| Comando                        | Qué hace                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------- |
| `@context-optimizer`           | Escanea y genera archivos optimizados directamente                            |
| `@context-optimizer /audit`    | Informe de auditoría con recuentos de líneas, estimaciones de tokens y costos |
| `@context-optimizer /optimize` | Plan de optimización detallado archivo por archivo                            |
| `@context-optimizer /compare`  | Proyección antes/después sin aplicar cambios                                  |
| `@context-optimizer /apply`    | Muestra diffs y aplica archivos con confirmación explícita                    |
| `@context-optimizer /init`     | Crea archivos de contexto desde los metadatos del proyecto                    |
| `@context-optimizer /help`     | Muestra los comandos disponibles y su uso                                     |

## Configuración

| Configuración                              | Predeterminado | Descripción                                                                                                         |
| ------------------------------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------- |
| `contextOptimizer.autoLoadedLineThreshold` | `80`           | Líneas máximas recomendadas para archivos cargados automáticamente. Los archivos que excedan disparan advertencias. |
| `contextOptimizer.maxFilesPerPattern`      | `1000`         | Máximo de archivos por patrón de escaneo. Útil para monorepos grandes.                                              |
| `contextOptimizer.excludeGlob`             | `**/{node_modules,dist,build,.git,.next,.turbo,.pnpm-store}/**` | Glob para excluir directorios del escaneo. |

## Características

- **Estimación de tokens orientada al contenido** — proyección basada en el contenido real de los archivos
- **Detección de similitud** — identifica archivos HIGH con >40% de superposición (coeficiente Dice)
- **Enlaces clicables** — el informe de auditoría incluye anclas para abrir archivos directamente
- **Modo de aplicación segura** — `/apply` muestra diffs y solo escribe tras confirmación explícita
- **Scaffolding de proyecto** — `/init` lee `package.json`, `pyproject.toml`, `Cargo.toml` o `go.mod` y genera un `copilot-instructions.md` inicial
- **Umbral configurable** — ajuste el presupuesto de líneas autocargadas en la configuración

## Ejemplo de Salida

```
## Informe de Auditoría de Contexto de IA

### Resumen
| Métrica                               | Líneas | ~Tokens |
|---------------------------------------|--------|--------|
| CARGADO AUTOMÁTICAMENTE (cada sesión) | 142    | ~4,260 |
| Medio (condicional)                   | 28     | ~840   |
| Alcance (applyTo)                     | 0      | ~0     |
| Lazy (bajo demanda)                   | 45     | ~1,350 |
| Total                                 | 215    | ~6,450 |

⚠️ El contexto autocargado (142 líneas, ~4,260 tokens) excede el límite de ~80 líneas.

### 🔁 Similitud de Contenido
| Archivo A                  | Archivo B  | Similitud |
|----------------------------|------------|----------|
| copilot-instructions.md    | CLAUDE.md  | 67%       |
```

## Requisitos

- VS Code 1.100+
- Extensión GitHub Copilot Chat (para la API del participante de chat)

## Licencia

[MIT](LICENSE)
