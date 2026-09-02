/**
 * Built-in Code Mode extension — sandboxed TypeScript execution via
 * TanStack `ai-code-mode`.
 *
 * Provides:
 * - `execute_typescript` tool: run model-written TypeScript in a secure isolate,
 *   with a curated subset of agent tools exposed as `external_*` functions.
 * - `discover_tools` companion tool (only when some external tools are marked
 *   `lazy`), letting the model discover lazy tools on demand.
 * - Per-turn system-prompt guidance documenting the sandbox API + external_*
 *   bindings (progressive disclosure: lazy tools appear in a catalog, not as
 *   full type stubs).
 *
 * Runtime-agnostic: the isolate backend is NOT imported here. The extension
 * feature-detects the optional CoreEnv capability `createIsolateDriver`. If the
 * host provides one (Node via `@tanstack/ai-isolate-node`, browser/WebContainer
 * hosts omit it), code mode is wired up; otherwise the extension degrades
 * gracefully (warns and registers nothing) with zero native deps in core.
 */
import { createCodeMode } from "@tanstack/ai-code-mode";

import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionToolDefinition,
  ToolCallResult,
} from "../extension/types.js";
import type { AnyServerTool, LazyToolsConfig, SchemaInput } from "@tanstack/ai";
import type { CodeModeTool } from "@tanstack/ai-code-mode";

// ============================================================================
// Config
// ============================================================================

/** Fine-grained configuration for the built-in code-mode extension. */
export interface CodeModeExtensionConfig {
  /**
   * Curated subset of agent tools to expose as `external_*` functions inside
   * the sandbox. Only server tools with an `execute` implementation are valid.
   * Defaults to an empty array (extension degrades if none provided).
   */
  tools?: Array<AnyServerTool>;
  /**
   * Names among `tools` to mark `lazy: true`. Lazy tools are kept out of the
   * system prompt's full type-stub documentation and listed in a Discoverable
   * APIs catalog instead (surfaced on demand via `discover_tools`). This keeps
   * the system prompt small — only a curated eager subset gets full stubs.
   */
  lazyToolNames?: string[];
  /** Execution timeout in milliseconds (default: 30000). */
  timeout?: number;
  /** Memory limit for the isolate in MB (default: 128). */
  memoryLimit?: number;
  /** Optional lazy-tool discovery config (defaults to `{ includeDescription: 'none' }`). */
  lazyToolsConfig?: LazyToolsConfig;
  /** Hard-disable the extension regardless of driver availability. */
  disabled?: boolean;
}

// ============================================================================
// Extension factory
// ============================================================================

/**
 * Bridge a TanStack server tool into an {@link ExtensionToolDefinition} so it
 * can be registered through `ctx.registerTool` (which re-wraps via
 * `defineServerTool`). Preserves name/description/schemas/execute.
 */
function toExtensionTool(tool: AnyServerTool): ExtensionToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: (tool.inputSchema ?? {}) as SchemaInput,
    outputSchema: tool.outputSchema as SchemaInput | undefined,
    execute: async (input, options) => {
      const result = await tool.execute?.(input, {
        toolCallId: options.toolCallId,
        abortSignal: options.abortSignal,
      });
      return (result ?? {}) as ToolCallResult;
    },
  };
}

/**
 * Create the built-in code-mode extension. Load it via the extension runner in
 * agent-factory alongside LSP / Skills / Memory / MCP.
 */
export function createCodeModeExtension(options: CodeModeExtensionConfig = {}): ExtensionAPI {
  return {
    id: "my-agent-code-mode",
    name: "Code Mode",
    version: "1.0.0",
    description: "Sandboxed TypeScript execution (TanStack ai-code-mode)",

    async activate(ctx) {
      if (options.disabled) return;

      // Feature-detect the isolate backend (optional CoreEnv capability).
      let driver;
      try {
        driver = await ctx.coreEnv.createIsolateDriver?.();
      } catch (err) {
        ctx.logger.warn(
          `Code Mode disabled: createIsolateDriver failed — ${err instanceof Error ? err.message : String(err)}`
        );
        return;
      }

      if (!driver) {
        ctx.logger.warn(
          "Code Mode disabled: no isolate driver provided by this host (CoreEnv.createIsolateDriver). execute_typescript not registered."
        );
        return;
      }

      const tools = options.tools ?? [];
      if (tools.length === 0) {
        ctx.logger.warn("Code Mode disabled: no external tools provided. execute_typescript not registered.");
        return;
      }

      // Mark the requested tools lazy so only the curated eager subset gets full
      // type stubs in the system prompt.
      const lazyNames = new Set(options.lazyToolNames ?? []);
      const codeModeTools = tools.map((t) => (lazyNames.has(t.name) ? { ...t, lazy: true } : t)) as Array<CodeModeTool>;

      const { tool, discoveryTool, systemPrompt } = createCodeMode({
        driver,
        tools: codeModeTools,
        timeout: options.timeout,
        memoryLimit: options.memoryLimit,
        lazyToolsConfig: options.lazyToolsConfig,
      });

      ctx.registerTool(toExtensionTool(tool));
      if (discoveryTool) {
        ctx.registerTool(toExtensionTool(discoveryTool));
      }

      // Inject code-mode system prompt guidance each turn.
      ctx.registerInterceptor<BeforeAgentStartEvent>("before_agent_start", (event) => {
        event.appendSystemPrompt = systemPrompt;
      });
    },
  };
}
