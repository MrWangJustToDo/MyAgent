/**
 * Built-in LSP extension — brings Language Server Protocol intelligence to the agent.
 *
 * Provides:
 * - 8 LSP tools: lsp_diagnostics, lsp_hover, lsp_definition, lsp_references,
 *   lsp_symbols, lsp_rename, lsp_completions, lsp_code_actions
 * - 4 commands: /lsp, /lsp-restart, /lsp-config, /lsp-lombok
 * - Auto file-sync (didOpen/didChange) after read/write/edit
 * - Auto-diagnostics injection into write/edit tool results
 * - 3 tree-sitter tools: code_overview, ast_search, code_rewrite (Phase 7)
 *
 * Runtime-agnostic: the JSON-RPC transport comes from `CoreEnv.createLspConnection`
 * (Node-only). When absent, LSP tools degrade gracefully.
 */

import { defaultPath } from "../../env.js";
import { toModelOutputRegistry } from "../tools/runtime/to-model-output-registry.js";

import { FileSync } from "./file-sync.js";
import { getLanguageIdFromPath } from "./language-map.js";
import { LspManager, type LspServerConfigRecord } from "./lsp-manager.js";
import { MAX_AUTO_DIAGNOSTIC_LINES } from "./shared/constants.js";
import { AUTO_DIAG_SERVER_WAIT_MS, AUTO_DIAG_SETTLE_POLL_MS, AUTO_DIAG_SETTLE_TIMEOUT_MS } from "./shared/timing.js";
import { lspTextToModelOutput } from "./shared/tool-output.js";
import { createCodeActionsTool } from "./tools/code-actions.js";
import { createCodeOverviewTool } from "./tools/code-overview.js";
import { createCodeRewriteTool } from "./tools/code-rewrite.js";
import { createCodeSearchTool } from "./tools/code-search.js";
import { createCompletionsTool } from "./tools/completions.js";
import { createDefinitionTool } from "./tools/definition.js";
import { createDiagnosticsTool } from "./tools/diagnostics.js";
import { createHoverTool } from "./tools/hover.js";
import { createReferencesTool } from "./tools/references.js";
import { createRenameTool } from "./tools/rename.js";
import { createSymbolsTool } from "./tools/symbols.js";
import { TreeSitterManager, type TreeSitterEnv } from "./tree-sitter/parser-manager.js";
import { getSyntaxErrors } from "./tree-sitter/symbol-extractor.js";
import { WorkspaceIndex } from "./tree-sitter/workspace-index.js";

import type { ExtensionAPI, ExtensionContext, ExtensionToolDefinition } from "../extension/types.js";

/** Project-level LSP config — loaded from `.lsp.json` in the workspace root. */
interface ProjectLspConfig {
  autoStart?: string[];
  lombokJar?: string;
  servers?: Record<string, LspServerConfigRecord>;
  autoInjectDiagnostics?: boolean | string[];
}

/** Create the built-in LSP extension (default export kept for interop). */
export function createLspExtension(): ExtensionAPI {
  return lspExtension();
}

/** The built-in LSP extension factory (matches ExtensionFactory shape). */
export function lspExtension(): ExtensionAPI {
  return {
    id: "my-agent-lsp",
    name: "LSP Integration",
    version: "1.0.0",
    description:
      "Language Server Protocol tools: diagnostics, hover, definition, references, symbols, rename, completions, code actions + auto file-sync",
    async activate(ctx) {
      await activateLsp(ctx);
    },
  };
}

export default lspExtension;

async function activateLsp(ctx: ExtensionContext): Promise<void> {
  const env = ctx.coreEnv;
  const corePath = env.path ?? defaultPath;
  const createConnection = env.createLspConnection;

  // Feature-detect: if the host has no process/stdio runtime, LSP tools degrade.
  if (!createConnection) {
    ctx.logger.warn("LSP: host has no createLspConnection — LSP tools will be unavailable");
  }

  // ---- Auto-diagnostics passthrough decorator (Phase 6 hardening) ----
  // `maybeInjectDiagnostics` appends `_lspDiagnostics` to write/edit tool results.
  // Those tools' own `toModelOutput` rebuild the model-facing text from a few
  // fields, which would drop the summary on the next turn. Decorate the base
  // handlers so the summary survives the `onConfig` / tool-compact rewrite.
  const AUTO_DIAG_TOOLS = ["write_file", "edit_file"] as const;
  for (const toolName of AUTO_DIAG_TOOLS) {
    toModelOutputRegistry.registerDecorator(toolName, async (ctx, next) => {
      const base = await next(ctx);
      const output = ctx.output as Record<string, unknown> | undefined;
      const diag = output?._lspDiagnostics;
      if (typeof diag !== "string" || diag.length === 0) return base;

      const suffix = `\n\n${diag}`;
      if (typeof base === "string") return base + suffix;
      if (Array.isArray(base)) {
        return [...base, { type: "text" as const, content: suffix }];
      }
      return base;
    });
  }

  // ---- Runtime access from CoreEnv ----
  const pathHelpers = {
    join: (...parts: string[]) => corePath.join(...parts),
    resolve: (...parts: string[]) => corePath.resolve(...parts),
    relative: (from: string, to: string) => {
      // Best-effort relative (CoreEnv has no relative; emulate via resolve prefix)
      const toAbs = corePath.resolve(to);
      const fromAbs = corePath.resolve(from);
      if (toAbs.startsWith(fromAbs)) {
        return toAbs.slice(fromAbs.length).replace(/^[/\\]/, "") || ".";
      }
      return toAbs;
    },
  };

  const fsHelpers = {
    existsSync: async (p: string) => {
      try {
        await env.fs.stat(p);
        return true;
      } catch {
        return false;
      }
    },
    exists: async (p: string) => {
      try {
        await env.fs.stat(p);
        return true;
      } catch {
        return false;
      }
    },
    readFile: (p: string) => env.fs.readFile(p, "utf-8") as Promise<string>,
    readdir: async (p: string) => {
      const entries = await env.fs.readdir(p);
      return entries.map((e) => ({
        name: e.name,
        isDirectory: e.type === "directory",
        isFile: e.type === "file",
      }));
    },
  };

  const runtimeEnv = await env.getEnv().catch(() => ({}) as Record<string, string | undefined>);
  const getEnvVar = (key: string) => runtimeEnv[key];

  // ---- Tree-sitter layer (runtime-agnostic via injected env) ----
  const treeSitterEnv: TreeSitterEnv = {
    readFile: (p) => env.fs.readFile(p, "utf-8") as Promise<string>,
    writeFile: (p, content) => env.fs.writeFile(p, content),
    readdir: async (p) => {
      const entries = await env.fs.readdir(p);
      return entries.map((e) => ({
        name: e.name,
        isDirectory: e.type === "directory",
        isFile: e.type === "file",
      }));
    },
    stat: async (p) => {
      const s = await env.fs.stat(p);
      return { size: s.size };
    },
    resolve: (...parts: string[]) => corePath.resolve(...parts),
    locateGrammar: env.locateTreeSitterGrammar,
  };
  const treeSitter = new TreeSitterManager(treeSitterEnv, getLanguageIdFromPath);
  const workspaceIndex = new WorkspaceIndex(ctx.cwd, treeSitter, treeSitterEnv);
  if (treeSitter.available()) {
    treeSitter.init().catch((err) => {
      ctx.logger.warn(`LSP: tree-sitter WASM init failed: ${err}`);
    });
  } else {
    ctx.logger.warn("LSP: no tree-sitter grammar locator — tree-sitter tools will be unavailable");
  }

  // ---- LspManager ----
  const rootDir = ctx.cwd;
  const manager = new LspManager(
    rootDir,
    (config) => {
      if (!createConnection) throw new Error("Current environment does not support LSP (no createLspConnection)");
      return createConnection(config);
    },
    pathHelpers,
    fsHelpers,
    undefined,
    {
      onServerStart: (languageId) => ctx.ui.setStatus("lsp", `LSP: starting ${languageId}...`),
      onServerReady: (languageId) => ctx.ui.setStatus("lsp", `LSP: ${languageId} ready`),
      onServerError: (languageId) => ctx.ui.setStatus("lsp", `LSP: ${languageId} failed`),
      onServerCrash: (languageId, restarting) => {
        ctx.ui.setStatus("lsp", restarting ? `LSP: restarting ${languageId}...` : `LSP: ${languageId} crashed`);
      },
    },
    getEnvVar
  );

  const fileSync = new FileSync(manager, fsHelpers);

  // ---- Project config (.lsp.json) ----
  let projectConfig: ProjectLspConfig | null = await loadProjectConfig(ctx, manager);
  if (projectConfig?.autoStart?.length) {
    manager.startEagerly(projectConfig.autoStart);
  }

  // Tools resolve the manager lazily so session:start can swap it.
  let activeManager: LspManager = manager;
  const getManager = () => activeManager;

  // ---- Tool factories ----
  /** Tree-sitter fallback for lsp_diagnostics when no LSP server is running. */
  const tsDiagnosticsFallback = async (filePath: string): Promise<string | null> => {
    if (!treeSitter.available()) return null;
    const absPath = getManager().resolvePath(filePath);
    try {
      const content = await treeSitterEnv.readFile(absPath);
      const tree = await treeSitter.parse(absPath, content);
      if (!tree) return null;
      const errors = getSyntaxErrors(tree);
      if (errors.length === 0) return null;
      const relPath = getManager().pathRelative(filePath);
      const lines = errors.slice(0, 10).map((e) => {
        const line = e.line + 1;
        const col = e.character + 1;
        return `${relPath}:${line}:${col} error: ${e.message}`;
      });
      if (errors.length > 10) lines.push(`... and ${errors.length - 10} more syntax error(s)`);
      return `${lines.length} syntax error(s) (tree-sitter fallback, no LSP server):\n${lines.join("\n")}`;
    } catch {
      return null;
    }
  };

  /** Tree-sitter fallback for lsp_hover/lsp_definition: show declaration signature. */
  const tsHoverFallback = async (filePath: string, line: number, character: number): Promise<string | null> => {
    if (!treeSitter.available()) return null;
    const absPath = getManager().resolvePath(filePath);
    try {
      const content = await treeSitterEnv.readFile(absPath);
      const tree = await treeSitter.parse(absPath, content);
      if (!tree) return null;
      const node = tree.rootNode.namedDescendantForPosition({ row: line - 1, column: character - 1 });
      if (!node) return null;
      const text = node.text;
      const firstLine = text.split("\n")[0].trim();
      if (!firstLine) return null;
      return `${node.type} (tree-sitter fallback)\n${firstLine}`;
    } catch {
      return null;
    }
  };

  ctx.registerTool(
    withLspTextOutput(createDiagnosticsTool({ manager: proxyManager(getManager), fallback: tsDiagnosticsFallback }))
  );
  ctx.registerTool(
    withLspTextOutput(createHoverTool({ manager: proxyManager(getManager), fallback: tsHoverFallback }))
  );
  ctx.registerTool(
    withLspTextOutput(
      createDefinitionTool({
        manager: proxyManager(getManager),
        treeSitter,
        workspaceIndex,
        readFile: (p) => treeSitterEnv.readFile(p),
      })
    )
  );
  ctx.registerTool(withLspTextOutput(createReferencesTool({ manager: proxyManager(getManager) })));
  ctx.registerTool(withLspTextOutput(createSymbolsTool({ manager: proxyManager(getManager), workspaceIndex })));
  ctx.registerTool(withLspTextOutput(createRenameTool({ manager: proxyManager(getManager) })));
  ctx.registerTool(withLspTextOutput(createCodeActionsTool({ manager: proxyManager(getManager) })));
  ctx.registerTool(
    withLspTextOutput(
      createCompletionsTool({
        manager: proxyManager(getManager),
        versionTracker: fileSync,
        readFile: (p) => treeSitterEnv.readFile(p),
      })
    )
  );

  // ---- Tree-sitter tools (degrade when grammar locator is absent) ----
  ctx.registerTool(
    withLspTextOutput(
      createCodeSearchTool({ rootDir: () => getManager().resolvePath("."), treeSitter, env: treeSitterEnv })
    )
  );
  ctx.registerTool(
    withLspTextOutput(
      createCodeRewriteTool({
        rootDir: () => getManager().resolvePath("."),
        treeSitter,
        env: treeSitterEnv,
        onFileModified: (filePath) => {
          fileSync.handleFileWrite(filePath).catch(() => {});
        },
      })
    )
  );
  ctx.registerTool(
    withLspTextOutput(
      createCodeOverviewTool({
        rootDir: () => getManager().resolvePath("."),
        treeSitter,
        env: treeSitterEnv,
        workspaceIndex,
      })
    )
  );

  // ---- Commands ----
  ctx.registerCommand({
    name: "lsp",
    description: "Show LSP server status",
    execute: async () => {
      const statuses = getManager().getStatus();
      if (statuses.length === 0) return "No LSP servers configured.";
      return statuses
        .map((s) => {
          const icon = s.running ? "🟢" : "⚪";
          const diags = s.diagnosticsCount > 0 ? ` (${s.diagnosticsCount} diagnostics)` : "";
          return `${icon} ${s.languageId}: ${s.command}${diags}`;
        })
        .join("\n");
    },
  });

  ctx.registerCommand({
    name: "lsp-restart",
    description: "Restart an LSP server: /lsp-restart <language> (e.g. java, typescript)",
    execute: async (args) => {
      const languageId = args[0]?.trim().toLowerCase();
      if (!languageId) {
        const statuses = getManager()
          .getStatus()
          .filter((s) => s.running);
        const langs = statuses.map((s) => s.languageId).join(", ");
        return statuses.length
          ? `Running servers: ${langs}\n\nUsage: /lsp-restart <language>`
          : "No LSP servers are running.\n\nUsage: /lsp-restart <language>";
      }
      try {
        await getManager().restartServer(languageId);
        return `${languageId} server restarted successfully.`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Failed to restart ${languageId}: ${msg}`;
      }
    },
  });

  ctx.registerCommand({
    name: "lsp-config",
    description: "Configure an LSP server: /lsp-config <language> <command> [args...]",
    execute: async (args) => {
      if (args.length < 2) {
        return "Usage: /lsp-config <language> <command> [args...]\nExample: /lsp-config python pylsp";
      }
      const [languageId, command, ...serverArgs] = args;
      getManager().setServerConfig(languageId, { command, args: serverArgs });
      return `Configured LSP for ${languageId}: ${command} ${serverArgs.join(" ")}`;
    },
  });

  ctx.registerCommand({
    name: "lsp-lombok",
    description: "Set Lombok jar path for Java: /lsp-lombok <path-to-lombok.jar>",
    execute: async (args) => {
      if (!args[0]) {
        const current = await getManager().getLombokJar();
        return current
          ? `Lombok jar: ${current}`
          : "No Lombok jar configured.\n\nUsage: /lsp-lombok <path-to-lombok.jar>";
      }
      const jarPath = args[0];
      const resolved = corePath.resolve(ctx.cwd, jarPath);
      const exists = await fsHelpers.exists(resolved);
      if (!exists) return `File not found: ${resolved}`;
      getManager().setLombokJar(resolved);
      return `Lombok jar set: ${resolved}`;
    },
  });

  // ---- File-sync + auto-diagnostics interceptors ----
  const handleAfter = async (toolName: string, args: unknown): Promise<void> => {
    const path = (args as { path?: string } | null)?.path;
    if (!path) return;
    try {
      if (toolName === "read_file") {
        await fileSync.handleFileRead(path);
      } else if (toolName === "write_file" || toolName === "edit_file") {
        await fileSync.handleFileWrite(path);
      }
    } catch {
      // File-sync errors are non-fatal
    }
  };

  // registerInterceptor returns unsubscribe; we store for deactivate if needed.
  const unsubs: Array<() => void> = [];

  unsubs.push(
    ctx.registerInterceptor("tool:after:read_file", async (event) => {
      await handleAfter("read_file", (event as { payload?: { args?: unknown } }).payload?.args);
    })
  );

  unsubs.push(
    ctx.registerInterceptor("tool:after:write_file", async (event) => {
      const payload = (event as { payload?: { args?: unknown; result?: unknown } }).payload;
      await handleAfter("write_file", payload?.args);
      await maybeInjectDiagnostics(payload?.args as { path?: string } | undefined, event);
    })
  );

  unsubs.push(
    ctx.registerInterceptor("tool:after:edit_file", async (event) => {
      const payload = (event as { payload?: { args?: unknown; result?: unknown } }).payload;
      await handleAfter("edit_file", payload?.args);
      await maybeInjectDiagnostics(payload?.args as { path?: string } | undefined, event);
    })
  );

  /** Auto-inject LSP error diagnostics into write/edit results (modifiedResult). */
  async function maybeInjectDiagnostics(
    params: { path?: string } | undefined,
    event: { payload?: unknown }
  ): Promise<void> {
    const path = params?.path;
    if (!path) return;
    const mgr = getManager();

    const languageId = mgr.getLanguageId(path);
    if (!languageId) return;

    const inject = projectConfig?.autoInjectDiagnostics;
    if (inject === false) return;
    if (Array.isArray(inject) && !inject.includes(languageId)) return;

    const client = await mgr.waitForClient(languageId, AUTO_DIAG_SERVER_WAIT_MS);
    if (!client) return;

    // Wait for the LSP to publish updated diagnostics. Analysis latency grows
    // with project size (monorepo roots are slower than isolated dirs), so poll
    // until errors appear or the timeout elapses instead of a single fixed wait.
    const uri = mgr.getFileUri(path);
    const deadline = Date.now() + AUTO_DIAG_SETTLE_TIMEOUT_MS;
    let errors: { severity?: number }[] = [];
    for (;;) {
      const diagnostics = mgr.getDiagnostics(uri);
      errors = (diagnostics as { severity?: number }[]).filter((d) => d.severity === 1);
      if (errors.length > 0 || Date.now() >= deadline) break;
      await new Promise((r) => setTimeout(r, AUTO_DIAG_SETTLE_POLL_MS));
    }

    if (errors.length === 0) return;

    const relPath = mgr.pathRelative(path);
    const lines = errors.slice(0, MAX_AUTO_DIAGNOSTIC_LINES).map((d) => {
      const dAny = d as {
        range?: { start?: { line?: number; character?: number } };
        message?: string;
        source?: string;
      };
      const line = (dAny.range?.start?.line ?? 0) + 1;
      const col = (dAny.range?.start?.character ?? 0) + 1;
      const source = dAny.source ? ` [${dAny.source}]` : "";
      return `${relPath}:${line}:${col} error: ${dAny.message ?? ""}${source}`;
    });
    if (errors.length > MAX_AUTO_DIAGNOSTIC_LINES) {
      lines.push(`... and ${errors.length - MAX_AUTO_DIAGNOSTIC_LINES} more error(s)`);
    }

    const summary = `\n\n⚠ LSP: ${errors.length} error(s) in ${relPath}:\n${lines.join("\n")}`;

    // Inject into the tool result so the model sees errors right after writing.
    // The existing result may be a structured object ({ text, ... }) or a string.
    const payload = event.payload as { result?: unknown } | undefined;
    const result = payload?.result;
    if (result != null && typeof result === "object") {
      (result as Record<string, unknown>)._lspDiagnostics = summary.trim();
    } else if (typeof result === "string") {
      payload!.result = result + summary;
    }

    ctx.ui.setStatus("lsp", `LSP: ${errors.length} error(s) in ${relPath}`);
  }

  // ---- Session lifecycle ----
  ctx.events.on("session:start", async (event) => {
    const payload = (event as { payload?: { cwd?: string } }).payload;
    if (!payload?.cwd) return;
    const newRoot = corePath.resolve(payload.cwd);

    // Shut down the old manager before swapping.
    await getManager()
      .shutdownAll()
      .catch(() => {});

    const newManager = new LspManager(
      newRoot,
      (config) => {
        if (!createConnection) throw new Error("Current environment does not support LSP");
        return createConnection(config);
      },
      pathHelpers,
      fsHelpers,
      undefined,
      {
        onServerStart: (l) => ctx.ui.setStatus("lsp", `LSP: starting ${l}...`),
        onServerReady: (l) => ctx.ui.setStatus("lsp", `LSP: ${l} ready`),
        onServerError: (l) => ctx.ui.setStatus("lsp", `LSP: ${l} failed`),
        onServerCrash: (l, restarting) =>
          ctx.ui.setStatus("lsp", restarting ? `LSP: restarting ${l}...` : `LSP: ${l} crashed`),
      },
      getEnvVar
    );
    activeManager = newManager;
    fileSync.setManager(newManager);
    const cfg = await loadProjectConfig(ctx, newManager);
    projectConfig = cfg;
    if (cfg?.autoStart?.length) newManager.startEagerly(cfg.autoStart);
  });

  ctx.events.on("session:shutdown", async () => {
    await getManager()
      .shutdownAll()
      .catch(() => {});
  });

  // ---- Turn-context provider (Phase 8): light LSP guidance ----
  ctx.registerTurnContextProvider(() => {
    return "LSP tools available (lsp_diagnostics, lsp_hover, lsp_definition, lsp_completions). After editing code, call lsp_diagnostics to check for compile errors.";
  });

  ctx.logger.info("LSP extension activated");
}

/** Lazy proxy that forwards property access to the currently-active manager. */
function proxyManager(getManager: () => LspManager): LspManager {
  return new Proxy({} as LspManager, {
    get(_target, prop) {
      return (getManager() as unknown as Record<string, unknown>)[prop as string];
    },
  });
}

function withLspTextOutput(def: ExtensionToolDefinition): ExtensionToolDefinition {
  return { ...def, toModelOutput: lspTextToModelOutput };
}

/** Load `.lsp.json` from the project root (best-effort, never throws). */
async function loadProjectConfig(ctx: ExtensionContext, manager: LspManager): Promise<ProjectLspConfig | null> {
  try {
    const configPath = ctx.coreEnv.path?.join(ctx.cwd, ".lsp.json") ?? `${ctx.cwd}/.lsp.json`;
    const content = await ctx.coreEnv.fs.readFile(configPath, "utf-8").catch(() => null);
    if (!content) return null;
    const parsed = JSON.parse(content as string) as ProjectLspConfig;
    if (typeof parsed !== "object" || parsed === null) return null;

    if (parsed.servers) {
      for (const [lang, conf] of Object.entries(parsed.servers)) {
        manager.setServerConfig(lang, {
          command: conf.command,
          args: conf.args ?? [],
          env: conf.env,
          initializationOptions: conf.initializationOptions,
          settings: conf.settings,
        });
      }
    }
    if (parsed.lombokJar && parsed.lombokJar !== "auto") {
      manager.setLombokJar(parsed.lombokJar);
    }
    return parsed;
  } catch {
    return null;
  }
}
