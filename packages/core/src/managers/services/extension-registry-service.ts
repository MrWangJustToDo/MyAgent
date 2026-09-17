/**
 * ExtensionRegistryService — the agent's extension / tool / integration
 * registration domain, extracted from ManagedAgent's "Tools / registries /
 * extensions" block.
 *
 * Owns: set-once integration managers (todo / MCP / skills), the extension
 * runner + loader pair, the in-memory extension command map, and the dynamic
 * tools provider used for approval checks. Tool registration mutates the
 * agent's live `tools` record in place (runners cache its identity), so the
 * caller passes the record plus invalidation callbacks per call.
 */

import { forgetToolPresentation } from "../../agent/tools/presentation/registry.js";
import { defineServerTool } from "../../agent/tools/runtime/define-tool.js";
import { toModelOutputRegistry } from "../../agent/tools/runtime/to-model-output-registry.js";

import type {
  ExtensionCommand,
  ExtensionLoader,
  ExtensionRunner,
  ExtensionToolDefinition,
} from "../../agent/extension";
import type { McpManager } from "../../agent/mcp/manager.js";
import type { SkillRegistry } from "../../agent/skills";
import type { TodoManager } from "../../agent/todo";
import type { ToolsRecord } from "../../agent/tools/runtime/tools-record.js";

/** Callbacks the caller (ManagedAgent) supplies for tool registration. */
export interface ExtensionToolRegistrationContext {
  /** The agent's live tools record — mutated in place, identity is stable. */
  tools: ToolsRecord;
  /**
   * Id of the extension registering the tool — the ledger key.
   *
   * Enables last-in-first-out restoration: when an extension is disabled, only the
   * entry IT displaced is popped, so an earlier extension that was overwritten by it
   * survives (and a built-in underneath both comes back once the last one goes).
   */
  ownerId: string;
  /** Structured warn sink (agent log). */
  warn: (message: string) => void;
  /** Called after the tools record changes so cached runners re-resolve. */
  onToolsChanged: () => void;
  /**
   * Owning agent id, used as a fallback when the run context supplies none.
   *
   * `ToolExecuteCtx.agentId` (from `ToolRunContext`) is the preferred source: it is set per
   * run by the runner, so it describes the run actually executing — which is what a tool
   * keying per-agent resources must use, since the same tool set serves the root and its
   * subagents. This field only covers hosts that register tools without a run context.
   */
  agentId?: string;
}

/** Who owns the entry that was already in the record before any extension registered. */
const INCUMBENT_TOOL_OWNER = "(incumbent)";

/** A stack of tool entries per name — bottom is what was there before, top is live. */
type ToolStack = Map<string, Array<{ ownerId: string; tool: unknown }>>;

export class ExtensionRegistryService {
  // Set-once integration managers
  private todo: TodoManager | null = null;
  private mcp: McpManager | null = null;
  private skills: SkillRegistry | null = null;

  // Extension runtime
  private runner: ExtensionRunner | null = null;
  private loader: ExtensionLoader | null = null;
  /** Commands registered via ExtensionContext (merged with runner commands on read). */
  private readonly commands = new Map<string, ExtensionCommand>();

  /** Dynamic tools provider (defaults to the agent's tools record). */
  private managedToolsProvider?: () => ToolsRecord;

  /**
   * Per-tool stacks of live registrations (see {@link ToolStack}).
   *
   * An entry stores its OWN tool, never a pointer to what it covered, so removing one owner's
   * entries and re-reading the top is all that "restore" ever needs.
   */
  private readonly toolStacks: ToolStack = new Map();

  // ---------------------------------------------------------------------------
  // Integration managers (set-once)
  // ---------------------------------------------------------------------------

  setTodoManager(t: TodoManager): void {
    if (this.todo) return;
    this.todo = t;
  }

  getTodoManager(): TodoManager | null {
    return this.todo;
  }

  setMcpManager(m: McpManager): void {
    if (this.mcp) return;
    this.mcp = m;
  }

  getMcpManager(): McpManager | null {
    return this.mcp;
  }

  setSkillRegistry(t: SkillRegistry): void {
    if (this.skills) return;
    this.skills = t;
  }

  getSkillRegistry(): SkillRegistry | null {
    return this.skills;
  }

  // ---------------------------------------------------------------------------
  // Extension runner / loader
  // ---------------------------------------------------------------------------

  setExtensionRunner(runner: ExtensionRunner): void {
    this.runner = runner;
  }

  getExtensionRunner(): ExtensionRunner | null {
    return this.runner;
  }

  setExtensionLoader(loader: ExtensionLoader): void {
    this.loader = loader;
  }

  getExtensionLoader(): ExtensionLoader | null {
    return this.loader;
  }

  // ---------------------------------------------------------------------------
  // Extension commands
  // ---------------------------------------------------------------------------

  registerCommand(cmd: ExtensionCommand, warn: (message: string) => void): void {
    if (this.commands.has(cmd.name)) {
      warn(`Command "/${cmd.name}" already registered, overwriting`);
    }
    this.commands.set(cmd.name, cmd);
  }

  /** Unregister a command previously added by an extension (used when disabling). */
  unregisterExtensionCommand(name: string): void {
    this.commands.delete(name);
  }

  /** Runner-registered commands win; in-memory commands are the fallback. */
  getExtensionCommands(): ExtensionCommand[] {
    if (this.runner) {
      return this.runner.getCommands();
    }
    return Array.from(this.commands.values());
  }

  // ---------------------------------------------------------------------------
  // Extension tools
  // ---------------------------------------------------------------------------

  registerTool(def: ExtensionToolDefinition, ctx: ExtensionToolRegistrationContext): void {
    const existing = (ctx.tools as Record<string, unknown>)[def.name];
    if (existing) {
      ctx.warn(`Tool "${def.name}" already registered, overwriting`);
    }
    // The incumbent becomes the bottom of the stack the first time an extension shadows this
    // name. It has to be captured HERE and only here: the tools record is the only holder of
    // the previous tool (nothing keeps a built-in base copy), so a stack that starts empty
    // would have nothing to fall back to when the last extension is disabled.
    if (!this.toolStacks.has(def.name)) {
      this.toolStacks.set(def.name, [{ ownerId: INCUMBENT_TOOL_OWNER, tool: existing }]);
    }

    const serverTool = defineServerTool({
      name: def.name,
      description: def.description,
      inputSchema: def.inputSchema,
      outputSchema: def.outputSchema,
      lazy: def.lazy,
      execute: async (args, toolCtx) =>
        def.execute(args, {
          toolCallId: toolCtx.toolCallId,
          abortSignal: toolCtx.abortSignal,
          // Fallback ONLY. `defineServerTool` already resolves the id from the run context
          // (`ToolRunContext.agentId`, set per run by the runner), and that value describes
          // the run actually executing while this one merely records which agent the tool was
          // registered on. Keep the run's value when present.
          agentId: toolCtx.agentId ?? ctx.agentId,
        }),
      present: def.present,
      toModelOutput: def.toModelOutput,
      // The handler belongs to the registering extension, not to the tool name, so disabling
      // the extension can drop it and expose the shadowed tool's own shaping again.
      ownerId: ctx.ownerId,
    });

    // The stack entry carries the tool itself, so nothing has to remember what it covered.
    this.stackOf(def.name).push({ ownerId: ctx.ownerId, tool: serverTool });
    (ctx.tools as Record<string, unknown>)[def.name] = serverTool;
    ctx.onToolsChanged();
  }

  /**
   * Drop one owner's registrations for a tool, and re-derive what is live.
   *
   * One operation for every case, because a stack has no ownership bookkeeping to get wrong:
   * remove this owner's entries and the top of what remains is live. That is the same whether
   * the owner was on top (an extension being disabled with the name to itself) or buried under
   * a newer extension (a handover, where the top is untouched and only this claim goes away).
   *
   * Both the tool stack and the model-output stack are filtered by the same owner, so a tool and
   * its result shaping can never be restored to different owners — the mismatch a
   * displacement-record design produced when an entry was removed out of order.
   */
  removeToolOwner(name: string, ownerId: string, ctx: ExtensionToolRegistrationContext): void {
    const stack = this.toolStacks.get(name);
    if (!stack) return;

    const remaining = stack.filter((entry) => entry.ownerId !== ownerId);
    // The runner calls this once per registration, so an owner that registered the name twice
    // reaches here a second time with nothing left to drop. Bail out instead of re-writing the
    // same tool and re-emitting — a no-op must stay a no-op.
    if (remaining.length === stack.length) return;
    const top = remaining[remaining.length - 1];

    if (!top || top.tool === undefined) {
      // Nothing left to fall back to: the name goes away.
      delete (ctx.tools as Record<string, unknown>)[name];
      this.toolStacks.delete(name);
    } else {
      (ctx.tools as Record<string, unknown>)[name] = top.tool;
      this.toolStacks.set(name, remaining);
    }

    // The descriptor was written by `defineServerTool` at registration; dropping it exposes
    // the restored tool's own declaration (or the built-in fallback table).
    forgetToolPresentation(name);
    toModelOutputRegistry.removeOwner(name, ownerId);
    ctx.onToolsChanged();
  }

  private stackOf(name: string): Array<{ ownerId: string; tool: unknown }> {
    const stack = this.toolStacks.get(name);
    if (!stack) throw new Error(`tool stack for "${name}" must be seeded before pushing`);
    return stack;
  }

  /**
   * Unregister a tool previously added by an extension (used when disabling).
   *
   * Delegates to {@link removeToolOwner}: dropping this owner's entry and re-reading the top
   * brings back whatever the tool name meant before this extension loaded — an earlier
   * extension's tool, or the built-in it shadowed.
   */
  unregisterExtensionTool(name: string, ctx: ExtensionToolRegistrationContext): void {
    this.removeToolOwner(name, ctx.ownerId, ctx);
  }

  // ---------------------------------------------------------------------------
  // Dynamic tools provider
  // ---------------------------------------------------------------------------

  setManagedToolsProvider(provider: () => ToolsRecord): void {
    this.managedToolsProvider = provider;
  }

  getManagedToolsProvider(): (() => ToolsRecord) | undefined {
    return this.managedToolsProvider;
  }
}
