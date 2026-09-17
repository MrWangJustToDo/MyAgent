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
import type { ToModelOutputSnapshot } from "../../agent/tools/runtime/to-model-output-registry.js";
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

/** What one extension's tool registration displaced, for last-in-first-out restoration. */
interface ToolDisplacement {
  /** The tool object that was in the record before this registration. */
  tool?: unknown;
  /** How the displaced tool shaped its results for the model, if it did. */
  toModelOutput?: ToModelOutputSnapshot;
}

/** A stack of displacements per tool name — one entry per extension that overwrote it. */
type ToolDisplacementLedger = Map<string, Array<{ ownerId: string; displaced: ToolDisplacement }>>;

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
   * What each extension tool registration displaced, keyed by tool name.
   *
   * The tools record holds no history of its own, and nothing keeps a copy of the
   * built-ins, so this ledger is the only way to bring back what a registration
   * shadowed. Pushed on register, popped on unregister (last-in-first-out).
   */
  private readonly toolDisplacements: ToolDisplacementLedger = new Map();

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
    // Record what this registration displaces BEFORE overwriting. The tools record is the
    // only holder of the previous tool (nothing keeps a built-in base copy), so without
    // this the displaced tool is unrecoverable and disabling an extension would delete a
    // built-in it merely shadowed.
    const ledger = this.toolDisplacements.get(def.name) ?? [];
    ledger.push({
      ownerId: ctx.ownerId,
      displaced: {
        ...(existing ? { tool: existing } : {}),
        toModelOutput: toModelOutputRegistry.snapshot(def.name),
      },
    });
    this.toolDisplacements.set(def.name, ledger);

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
    });
    (ctx.tools as Record<string, unknown>)[def.name] = serverTool;
    ctx.onToolsChanged();
  }

  /**
   * Drop one extension's ledger entry for a tool it no longer owns, without touching the
   * live tool.
   *
   * The runner refuses to unregister a name another extension has taken over (it must not
   * delete that extension's tool), but the ledger entry still has to go — otherwise the
   * displaced value is restored over the surviving tool the next time the same name is
   * unregistered.
   */
  releaseToolRegistration(name: string, ownerId: string): void {
    const ledger = this.toolDisplacements.get(name);
    if (!ledger) return;
    const index = ledger.findIndex((entry) => entry.ownerId === ownerId);
    if (index === -1) return;
    const [removed] = ledger.splice(index, 1);
    // The entry that overwrote this one is given what THIS one displaced. Dropping the entry
    // outright would orphan the chain: the next entry still points at a tool that just left
    // the record, so a later unregister would hand back an unloaded extension's tool.
    if (ledger[index]) ledger[index].displaced = removed.displaced;
    if (ledger.length === 0) this.toolDisplacements.delete(name);
  }

  /**
   * Unregister a tool previously added by an extension (used when disabling).
   *
   * Last-in-first-out: the entry this owner displaced is restored, so whatever the tool name
   * meant before the extension loaded comes back — an earlier extension's tool, or the
   * built-in the extension shadowed. Without a ledger entry (a name the extension did not
   * displace, e.g. one it registered on a fresh record) the name is simply deleted.
   */
  unregisterExtensionTool(name: string, ctx: ExtensionToolRegistrationContext): void {
    const ledger = this.toolDisplacements.get(name);
    // Last-in-first-out, and an owner may have displaced the same name more than once
    // (re-registering inside one activate), so scan from the end.
    let index = -1;
    if (ledger) {
      for (let i = ledger.length - 1; i >= 0; i--) {
        if (ledger[i].ownerId === ctx.ownerId) {
          index = i;
          break;
        }
      }
    }

    if (index === -1) {
      // No entry for this owner: nothing was displaced, and there is no proof the name is
      // even ours. Leave the record alone — deleting a name another extension owns would be
      // far worse than keeping a tool this extension did not own.
      return;
    }

    const [entry] = ledger!.splice(index, 1);
    if (ledger!.length === 0) this.toolDisplacements.delete(name);

    const displaced = entry.displaced;
    if (displaced.tool === undefined) {
      delete (ctx.tools as Record<string, unknown>)[name];
    } else {
      (ctx.tools as Record<string, unknown>)[name] = displaced.tool;
    }

    // The displaced tool's presentation descriptor was overwritten by `defineServerTool`
    // when the extension registered. Dropping it here exposes the restored tool's own
    // declaration (or the built-in fallback table), instead of leaving the extension's
    // descriptor advertising a tool that is gone.
    forgetToolPresentation(name);
    toModelOutputRegistry.restore(name, displaced.toModelOutput);
    ctx.onToolsChanged();
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
