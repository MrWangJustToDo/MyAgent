import { createSubagentTools } from "../agent/subagent/tools.js";
import { getEnv } from "../env.js";

import { AgentEventBus } from "./agent-event-bus.js";
import { buildManagedAgent } from "./agent-factory.js";
import { ACTIVE_STATUSES } from "./agent-status.js";
import { attachEventLogBridge } from "./event-log-bridge.js";
import { runManagedAgent, runManagedAgentStream, type RunAgentOptions, type RunAgentStreamInput } from "./run-agent.js";
import { emitSessionBootstrapEvents } from "./session-bootstrap-events.js";

import type { AgentEvent, AgentEventListener, AgentEventType } from "./agent-event-bus.js";
import type { ManagedAgent, ManagedAgentConfig } from "./managed-agent.js";
import type { ResumeResult, SessionData } from "../agent/session/types.js";
import type { ToolsRecord } from "../agent/tools/tanstack/tools-record.js";
import type { StreamChunk } from "@tanstack/ai";

export type { AgentEvent, AgentEventListener, AgentEventType } from "./agent-event-bus.js";
export type { ManagedAgent, ManagedAgentConfig } from "./managed-agent.js";
export type { RunAgentOptions, RunAgentStreamInput } from "./run-agent.js";

// ============================================================================
// Types & Schemas
// ============================================================================

/** Environment variable for additional skill directories (comma-separated paths) */
export const SKILL_DIRS_ENV_VAR = "AGENT_SKILL_DIRS";

/**
 * Get default skill directories to load.
 *
 * Default load order (first loaded wins for duplicate skill names):
 * 1. Environment variable paths (AGENT_SKILL_DIRS, comma-separated)
 * 2. User home directory: ~/.agents/skills
 * 3. Current project directory: .agents/skills
 *
 * @returns Array of skill directory paths (absolute or relative)
 */
export async function getDefaultSkillDirs(): Promise<string[]> {
  const env = getEnv();
  const dirs: string[] = [];

  const runEnv = await env.getEnv();

  const envDirs = runEnv[SKILL_DIRS_ENV_VAR];
  if (envDirs) {
    const parsedDirs = envDirs
      .split(",")
      .map((d) => d.trim())
      .filter((d) => d.length > 0);
    dirs.push(...parsedDirs);
  }

  const userSkillDir = env.path.join(await env.homedir(), ".agents", "skills");

  dirs.push(userSkillDir);

  dirs.push(".agents/skills");

  return dirs;
}

// ============================================================================
// AgentManager Class
// ============================================================================

export class AgentManager {
  /** Managed agents by ID */
  private agents: Map<string, ManagedAgent> = new Map();

  /** Unified event bus for in-process listeners */
  private eventBus = new AgentEventBus();

  private readonly _detachEventLogBridge: () => void;

  constructor() {
    this._detachEventLogBridge = attachEventLogBridge(this.eventBus, (event) => {
      const managed = this.agents.get(event.agentId) ?? (event.parentId ? this.agents.get(event.parentId) : undefined);
      return managed?.log ?? null;
    });
  }

  // ============================================================================
  // Event Emitter
  // ============================================================================

  /**
   * Subscribe to agent events.
   *
   * @param type - Event type or "*" for all events
   * @param listener - Callback function
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * // Listen to specific event
   * const unsubscribe = agentManager.on("subagent:created", (event) => {
   *   console.log(`Subagent ${event.data?.subagentId} created`);
   * });
   *
   * // Listen to all events
   * agentManager.on("*", (event) => {
   *   console.log(`Event: ${event.type}`);
   * });
   *
   * // Unsubscribe
   * unsubscribe();
   * ```
   */
  on(type: AgentEventType | "*", listener: AgentEventListener): () => void {
    return this.eventBus.on(type, listener);
  }

  /**
   * Emit an agent event.
   * @internal Agent code should use `emitAgentEvent()` / `agent.emitEvent()` instead.
   */
  emit(event: AgentEvent): void {
    this.eventBus.emit(event);
  }

  // ============================================================================
  // Agent Lifecycle
  // ============================================================================

  /**
   * Create a new agent
   */
  async createManagedAgent(config: ManagedAgentConfig, parentId?: string): Promise<ManagedAgent> {
    const { managed, bootstrap } = await buildManagedAgent({
      config,
      parentId,
      manager: this,
      emit: (event) => this.emit(event),
      getDefaultSkillDirs,
    });

    this.agents.set(managed.id, managed);

    if (bootstrap) {
      await emitSessionBootstrapEvents(managed, bootstrap);
    }

    if (parentId) {
      const parent = this.agents.get(parentId);
      if (parent) {
        parent.childIds.push(managed.id);
        parent.updatedAt = Date.now();
      }
    }

    return managed;
  }

  /**
   * Spawn a subagent from a parent agent
   */
  async spawnSubagent(parentId: string, config: Partial<ManagedAgentConfig>): Promise<ManagedAgent> {
    const parent = this.agents.get(parentId);
    if (!parent) {
      throw new Error(`Parent agent not found: ${parentId}`);
    }
    const finalConfig = { ...parent.config, ...config };
    const subagent = await this.createManagedAgent(finalConfig, parentId);

    const customTools = (config as { subagentTools?: ToolsRecord | null }).subagentTools;
    if (customTools !== undefined) {
      subagent.tools = customTools ?? {};
    } else {
      subagent.tools = createSubagentTools(subagent);
    }
    subagent.runner = undefined;

    return subagent;
  }

  /**
   * Get an agent by ID
   */
  getAgent(id: string): ManagedAgent | undefined {
    return this.agents.get(id);
  }

  /**
   * Get all agents
   */
  getAgents(): ManagedAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get root agents (agents without parent)
   */
  getRootAgents(): ManagedAgent[] {
    return this.getAgents().filter((a) => !a.parentId);
  }

  /**
   * Get subagents of a parent
   */
  getSubagents(parentId: string): ManagedAgent[] {
    const parent = this.agents.get(parentId);
    if (!parent) return [];
    return parent.childIds.map((id) => this.agents.get(id)).filter((a): a is ManagedAgent => a !== undefined);
  }

  /**
   * Recursively collect all *active* subagents under the given root agent.
   *
   * "Active" means the subagent's status indicates it is currently doing work
   * (running / thinking / responding / waiting / compacting). Subagents that
   * have already terminated (idle / completed / aborted / error) are skipped.
   *
   * Results are ordered deepest-first so that the most recently spawned
   * subagent is cancelled first (LIFO), matching the natural call stack.
   *
   * This is used by the app layer to implement layered cancellation:
   * when subagents are active, cancelling targets only the subagents
   * (one by one) and leaves the root agent's abort signal untouched.
   *
   * @param rootAgentId The root agent to search under
   * @returns Active subagents, deepest-first
   */
  getActiveSubagents(rootAgentId: string): ManagedAgent[] {
    const result: ManagedAgent[] = [];

    const walk = (agentId: string) => {
      const managed = this.agents.get(agentId);
      if (!managed) return;
      // Recurse into children first (deepest-first ordering)
      for (const childId of [...managed.childIds].reverse()) {
        walk(childId);
      }
      // Include this node if it is a subagent (has parent) and currently active
      if (managed.parentId && ACTIVE_STATUSES.has(managed.status)) {
        result.push(managed);
      }
    };

    walk(rootAgentId);
    return result;
  }

  /**
   * Destroy an agent and its subagents
   */
  destroyAgent(id: string): void {
    const managedAgent = this.agents.get(id);
    if (!managedAgent) return;

    // Force-kill MCP child processes synchronously to prevent orphans on exit
    managedAgent.mcpManager?.forceKill();

    managedAgent.abort("Agent destroyed");

    // Destroy all subagents first
    for (const childId of [...managedAgent.childIds]) {
      this.destroyAgent(childId);
    }

    // Remove from parent's childIds
    if (managedAgent.parentId) {
      const parent = this.agents.get(managedAgent.parentId);
      if (parent) {
        parent.childIds = parent.childIds.filter((cid) => cid !== id);
        parent.updatedAt = Date.now();
      }
    }

    this.agents.delete(id);
  }

  /**
   * Resume a session by ID. Restores messages, summary, compactIndex, usage, and todos.
   * Returns UIMessages for the client to display.
   */
  async resumeSession(agentId: string, sessionId: string): Promise<ResumeResult> {
    const managed = this.agents.get(agentId);
    if (!managed) throw new Error(`Agent not found: ${agentId}`);

    const session = await managed.restoreSession(sessionId);

    return {
      uiMessages: session.uiMessages,
      session: {
        id: session.id,
        name: session.name,
        version: session.version,
        modelStyle: session.modelStyle,
        model: session.model,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      },
    };
  }

  /**
   * Continue the most recent session. Returns null if no sessions exist.
   */
  async continueLatestSession(agentId: string): Promise<ResumeResult | null> {
    const managed = this.agents.get(agentId);
    if (!managed) throw new Error(`Agent not found: ${agentId}`);

    const store = managed.getSessionStore();
    if (!store) throw new Error("Session store not available");

    const latest = await store.getLatest();
    if (!latest) return null;

    return this.resumeSession(agentId, latest.id);
  }

  /**
   * List all sessions for a given agent's session store.
   */
  async listSessions(agentId: string): Promise<SessionData[]> {
    const managed = this.agents.get(agentId);
    if (!managed) throw new Error(`Agent not found: ${agentId}`);

    const store = managed.getSessionStore();
    if (!store) return [];

    return (await store.list()) as unknown as SessionData[];
  }

  /**
   * Run an agent via TanStack `AgentRunner` and yield AG-UI chunks in-process.
   * Updates {@link ManagedAgent.status} and {@link ManagedAgent.usage} via lifecycle middleware.
   */
  runAgentStream(agentId: string, input: RunAgentStreamInput): AsyncIterable<StreamChunk> {
    return runManagedAgentStream(this, agentId, input);
  }

  /**
   * Run an agent via TanStack `AgentRunner`.
   * Returns AG-UI stream chunks; optionally bridges to UIMessages when `bridgeUI` is set.
   */
  runAgent(
    agentId: string,
    input: RunAgentStreamInput,
    options?: RunAgentOptions
  ): Promise<AsyncIterable<StreamChunk>> {
    return runManagedAgent(this, agentId, input, options);
  }

  /**
   * Destroy all agents
   */
  reset(): void {
    // Destroy root agents (which will cascade to subagents)
    for (const agent of this.getRootAgents()) {
      this.destroyAgent(agent.id);
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Default singleton instance for global use
 */
export const agentManager = new AgentManager();
