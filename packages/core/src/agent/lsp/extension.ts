/**
 * Built-in LSP extension — brings Language Server Protocol intelligence to the agent.
 *
 * Provides:
 * - 8 LSP tools: lsp_diagnostics, lsp_hover, lsp_definition, lsp_references,
 *   lsp_symbols, lsp_rename, lsp_completions, lsp_code_actions
 * - 3 commands: /lsp, /lsp-restart, /lsp-config
 * - Auto file-sync (didOpen/didChange) after read/write/edit
 * - Auto-diagnostics injection into write/edit tool results
 * - 3 tree-sitter tools: code_overview, ast_search, code_rewrite (Phase 7)
 *
 * Runtime-agnostic: the JSON-RPC transport comes from `CoreEnv.createLspConnection`
 * (Node-only). When absent, LSP tools degrade gracefully.
 */

import { DISCOVERY_TOOL_NAME } from "@tanstack/ai";

import { defaultPath } from "../../env.js";
import { toModelOutputRegistry } from "../tools/runtime/to-model-output-registry.js";

import { FileSync } from "./file-sync.js";
import { EXT_TO_LANGUAGE, getLanguageIdFromPath } from "./language-map.js";
import { LspManager, type LspServerConfigRecord } from "./lsp-manager.js";
import { applyDiagnosticsToToolAfterPayload } from "./shared/apply-tool-diagnostics.js";
import { MAX_AUTO_DIAGNOSTIC_LINES } from "./shared/constants.js";
import { extractToolPath } from "./shared/parse-tool-args.js";
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

import type { ExtensionAPI, ExtensionContext, ExtensionToolDefinition, ToolAfterEvent } from "../extension/types.js";

/** Project-level LSP config — loaded from `.lsp.json` in the workspace root. */
interface ProjectLspConfig {
  autoStart?: string[];
  lombokJar?: string;
  servers?: Record<string, LspServerConfigRecord>;
  autoInjectDiagnostics?: boolean | string[];
}

/**
 * Fine-grained configuration for the built-in LSP extension.
 *
 * By default the extension registers all tools except the low-usage set in
 * {@link DEFAULT_DISABLED_LSP_TOOLS} (opt-in). `enableAll` re-enables every tool.
 */
export interface LspExtensionConfig {
  /**
   * Tool names to skip registering (e.g. `"lsp_rename"`, `"ast_search"`).
   * Defaults to {@link DEFAULT_DISABLED_LSP_TOOLS}. Setting this replaces the
   * default (no automatic merge).
   */
  disabledTools?: string[];
  /** Re-enable all tools (overrides `disabledTools`). */
  enableAll?: boolean;
}

/**
 * LSP / tree-sitter tools that are skipped by default to save per-turn context.
 * These are the lowest-usage tools — re-enable with `enableAll: true` or by
 * listing them in `disabledTools` (i.e. not disabling them).
 */
export const DEFAULT_DISABLED_LSP_TOOLS: readonly string[] = [
  "lsp_rename",
  "lsp_code_actions",
  "ast_search",
  "code_rewrite",
  "code_overview",
];

/** Create the built-in LSP extension. */
export function createLspExtension(options?: LspExtensionConfig): ExtensionAPI {
  return {
    id: "my-agent-lsp",
    name: "LSP Integration",
    version: "1.0.0",
    description:
      "Language Server Protocol tools: diagnostics, hover, definition, references, symbols, rename, completions, code actions + auto file-sync",
    async activate(ctx) {
      await activateLsp(ctx, options);
    },
  };
}

async function activateLsp(ctx: ExtensionContext, options?: LspExtensionConfig): Promise<void> {
  const env = ctx.coreEnv;
  const corePath = env.path ?? defaultPath;
  const createConnection = env.createLspConnection;

  // Resolve the set of tools to skip registering (saves per-turn context).
  const enableAll = options?.enableAll === true;
  const disabledTools = enableAll
    ? new Set<string>()
    : new Set<string>(options?.disabledTools ?? DEFAULT_DISABLED_LSP_TOOLS);

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
    getEnvVar,
    env.commandExists
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

  /** True when a tool should be registered (not in the disabled set). */
  const shouldRegister = (name: string): boolean => !disabledTools.has(name);

  ctx.registerTool(
    withLspTextOutput(createDiagnosticsTool({ manager: proxyManager(getManager), fallback: tsDiagnosticsFallback }))
  );
  ctx.registerTool(
    withLazy(withLspTextOutput(createHoverTool({ manager: proxyManager(getManager), fallback: tsHoverFallback })))
  );
  ctx.registerTool(
    withLazy(
      withLspTextOutput(
        createDefinitionTool({
          manager: proxyManager(getManager),
          treeSitter,
          workspaceIndex,
          readFile: (p) => treeSitterEnv.readFile(p),
        })
      )
    )
  );
  ctx.registerTool(withLazy(withLspTextOutput(createReferencesTool({ manager: proxyManager(getManager) }))));
  ctx.registerTool(
    withLazy(withLspTextOutput(createSymbolsTool({ manager: proxyManager(getManager), workspaceIndex })))
  );
  if (shouldRegister("lsp_rename")) {
    ctx.registerTool(withLspTextOutput(createRenameTool({ manager: proxyManager(getManager) })));
  }
  if (shouldRegister("lsp_code_actions")) {
    ctx.registerTool(withLspTextOutput(createCodeActionsTool({ manager: proxyManager(getManager) })));
  }
  ctx.registerTool(
    withLazy(
      withLspTextOutput(
        createCompletionsTool({
          manager: proxyManager(getManager),
          versionTracker: fileSync,
          readFile: (p) => treeSitterEnv.readFile(p),
        })
      )
    )
  );

  // ---- Tree-sitter tools (degrade when grammar locator is absent) ----
  if (shouldRegister("ast_search")) {
    ctx.registerTool(
      withLspTextOutput(
        createCodeSearchTool({ rootDir: () => getManager().resolvePath("."), treeSitter, env: treeSitterEnv })
      )
    );
  }
  if (shouldRegister("code_rewrite")) {
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
  }
  if (shouldRegister("code_overview")) {
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
  }

  // ---- Commands ----
  ctx.registerCommand({
    name: "lsp",
    description: "Show LSP server status",
    execute: async () => {
      const statuses = getManager().getStatus();
      if (statuses.length === 0) return "No LSP servers configured.";

      const lines = statuses.map((s) => {
        let icon = "⚪";
        if (s.running) icon = "🟢";
        else if (s.available === false) icon = "🔴";
        const diags = s.diagnosticsCount > 0 ? ` (${s.diagnosticsCount} diagnostics)` : "";
        const hint = s.available === false ? ` — ${s.unavailableReason ?? `'${s.command}' not found on PATH`}` : "";
        return `${icon} ${s.languageId}: ${s.command}${diags}${hint}`;
      });

      // Languages with an extension mapping but no configured server.
      const configured = new Set(statuses.map((s) => s.languageId));
      const mappedOnly = [...new Set(Object.values(EXT_TO_LANGUAGE))].filter((lang) => !configured.has(lang)).sort();
      if (mappedOnly.length > 0) {
        lines.push("");
        lines.push("🔵 Mapped languages without a server (add to .lsp.json `servers` to enable):");
        lines.push(`   ${mappedOnly.join(", ")}`);
      }

      lines.push("");
      lines.push("Legend: 🟢 running · ⚪ configured but idle · 🔴 command not found · 🔵 mapped-only (no server)");
      return lines.join("\n");
    },
  });

  ctx.registerCommand({
    name: "lsp-restart",
    description: "Restart an LSP server: /lsp-restart <language> (e.g. java, typescript)",
    // Secondary options: every configured language (idle / running / failed), so
    // the user can pick without typing — mirrors /skill and /memory options.
    getOptions: () =>
      getManager()
        .getStatus()
        .map((s) => ({
          label: s.languageId,
          value: s.languageId,
          description: s.command,
        })),
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
    // Secondary options: all languages the extension can map plus any already
    // configured one. Selecting fills `/lsp-config <lang> ` (append-only), so the
    // user then types the server command.
    getOptions: () => {
      const langs = new Set(Object.values(EXT_TO_LANGUAGE));
      for (const s of getManager().getStatus()) langs.add(s.languageId);
      return [...langs].sort().map((lang) => ({ label: lang, value: lang, description: "Configure an LSP server" }));
    },
    execute: async (args) => {
      if (args.length < 2) {
        return "Usage: /lsp-config <language> <command> [args...]\nExample: /lsp-config python pylsp";
      }
      const [languageId, command, ...serverArgs] = args;
      getManager().setServerConfig(languageId, { command, args: serverArgs });
      return `Configured LSP for ${languageId}: ${command} ${serverArgs.join(" ")}`;
    },
  });

  // ---- File-sync + auto-diagnostics interceptors ----
  const handleAfter = async (toolName: string, filePath: string): Promise<void> => {
    try {
      if (toolName === "read_file") {
        await fileSync.handleFileRead(filePath);
      } else if (toolName === "write_file" || toolName === "edit_file") {
        await fileSync.handleFileWrite(filePath);
      }
    } catch {
      // File-sync errors are non-fatal
    }
  };

  // registerInterceptor returns unsubscribe; we store for deactivate if needed.
  const unsubs: Array<() => void> = [];

  unsubs.push(
    ctx.registerInterceptor<ToolAfterEvent>("tool:after:read_file", async (event) => {
      const path = extractToolPath(event.payload.args);
      if (path) await handleAfter("read_file", path);
    })
  );

  unsubs.push(
    ctx.registerInterceptor<ToolAfterEvent>("tool:after:write_file", async (event) => {
      const path = extractToolPath(event.payload.args);
      if (path) await handleAfter("write_file", path);
      await maybeInjectDiagnostics(path, event);
    })
  );

  unsubs.push(
    ctx.registerInterceptor<ToolAfterEvent>("tool:after:edit_file", async (event) => {
      const path = extractToolPath(event.payload.args);
      if (path) await handleAfter("edit_file", path);
      await maybeInjectDiagnostics(path, event);
    })
  );

  /** Auto-inject LSP error diagnostics into write/edit results via modifiedResult. */
  async function maybeInjectDiagnostics(path: string | undefined, event: ToolAfterEvent): Promise<void> {
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
    applyDiagnosticsToToolAfterPayload(event.payload, summary);
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
      getEnvVar,
      env.commandExists
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
  // Advertise code-intelligence tools only when usable in this host. Diagnostics /
  // hover / definition degrade to syntax-level tree-sitter fallbacks when no LSP
  // runtime exists; completions has no fallback, so it requires `createLspConnection`.
  // Disabled tools (disabledTools) are never advertised. When nothing is usable we
  // register no provider, so the model is not misled into calling dead tools.
  const lspRuntimeAvailable = Boolean(createConnection);
  const tsFallbackAvailable = treeSitter.available();
  // Eager tools are advertised as directly callable; lazy ones need discovery.
  const advertisedEager: string[] = [];
  const advertisedLazy: string[] = [];
  const pushAdvertised = (name: string, available: boolean) => {
    if (!shouldRegister(name) || !available) return;
    if (name === "lsp_diagnostics") advertisedEager.push(name);
    else advertisedLazy.push(name);
  };
  pushAdvertised("lsp_diagnostics", lspRuntimeAvailable || tsFallbackAvailable);
  pushAdvertised("lsp_hover", lspRuntimeAvailable || tsFallbackAvailable);
  pushAdvertised("lsp_definition", lspRuntimeAvailable || tsFallbackAvailable);
  pushAdvertised("lsp_completions", lspRuntimeAvailable);

  if (advertisedEager.length > 0 || advertisedLazy.length > 0) {
    const scope = lspRuntimeAvailable ? "LSP" : "Code (tree-sitter fallback)";
    const errorKind = lspRuntimeAvailable ? "compile errors" : "syntax errors";
    const parts: string[] = [];
    if (advertisedEager.length > 0) parts.push(`${advertisedEager.join(", ")} is always available`);
    if (advertisedLazy.length > 0)
      parts.push(
        `${advertisedLazy.join(", ")} are lazy tools — discover them via ${DISCOVERY_TOOL_NAME} before calling`
      );
    const guidance = `${scope} tools: ${parts.join("; ")}. After editing code, call lsp_diagnostics to check for ${errorKind}.`;
    ctx.registerContextProvider({
      content: () => guidance,
      disabledContent: () =>
        "LSP integration is disabled — language tooling (diagnostics, hover, definition, references, rename, completions) and auto file-sync are unavailable.",
    });
  }

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

/**
 * Mark a tool as `lazy` (excluded from the initial request; discovered on demand
 * via the synthetic `__lazy__tool__discovery__` tool). Used for low-usage LSP
 * tools to save per-turn token cost. Execution is unchanged — degradation paths
 * (no LSP server / tree-sitter fallback) still apply when the tool is discovered
 * and called.
 */
function withLazy(def: ExtensionToolDefinition): ExtensionToolDefinition {
  return { ...def, lazy: true };
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
