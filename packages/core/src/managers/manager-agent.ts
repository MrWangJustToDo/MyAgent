import { convertToModelMessages, type LanguageModel, type UIMessage } from "ai";

import { AgentLog } from "../agent";
import { AgentContext } from "../agent/agent-context";
import { loadAgentDoc, formatAgentDocResult } from "../agent/agent-doc-loader.js";
import { createCompactionConfig } from "../agent/compaction/types.js";
import { HookRegistry } from "../agent/hooks/hook-registry.js";
import { Agent } from "../agent/loop/Agent.js";
import { loadMcpConfig } from "../agent/mcp/config.js";
import { McpManager } from "../agent/mcp/manager.js";
import { MemoryManager } from "../agent/memory/memory-manager.js";
import { SessionStore } from "../agent/session/session-store.js";
import { SkillRegistry } from "../agent/skills/skill-registry.js";
import { TodoManager } from "../agent/todo-manager";
import { createTools, createWebfetchTool, createWebsearchTool } from "../agent/tools";
import { createAskUserTool } from "../agent/tools/ask-user-tool.js";
import { createListSkillsTool } from "../agent/tools/list-skills-tool.js";
import { createLoadSkillTool } from "../agent/tools/load-skill-tool.js";
import { createTaskTool } from "../agent/tools/task-tool.js";
import { getEnv } from "../env.js";
import { getModel } from "../models/registry.js";

import { AgentEventBus } from "./agent-event-bus.js";

import type { AgentEvent, AgentEventListener, AgentEventType } from "./agent-event-bus.js";
import type { CompactionConfigInput } from "../agent/compaction/types.js";
import type { AgentConfig, ToolSet } from "../agent/loop/types.js";
import type { ResumeResult, SessionData } from "../agent/session/types.js";
import type { ModelInfo } from "../models/types.js";

export type { AgentEvent, AgentEventListener, AgentEventType } from "./agent-event-bus.js";

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

export type ManagedAgentConfig<T = Agent | AgentContext> = AgentConfig & {
  /** Optional custom ID for the agent (auto-generated if not provided) */
  id?: string;
  name: string;
  /** Vercel AI SDK LanguageModel instance */
  languageModel: LanguageModel;
  /** Model metadata from the registry (auto-resolved from config.model if not provided) */
  modelInfo?: ModelInfo;
  setUp?: (instance: T) => T;
  /** Skill directories to load (relative to CoreEnv rootPath or absolute). Defaults to [".agents/skills"] */
  skillDirs?: string[];
  /** Compaction configuration for context management */
  compaction?: CompactionConfigInput;
  /** Path to MCP config file (relative to CoreEnv rootPath). Defaults to ".opencode/mcp.json" */
  mcpConfigPath?: string;
  /**
   * Agent documentation filenames to search for, in priority order.
   * These files (e.g., AGENTS.md, CLAUDE.md) are loaded and injected into
   * the system prompt to provide project instructions to the agent.
   *
   * Default: ["CLAUDE.md", "AGENTS.md"] (CLAUDE.md has higher priority)
   * Set to [] to disable auto-loading.
   *
   * @see https://agents.md/ for the cross-tool AGENTS.md standard
   */
  agentDocFilenames?: string[];
  /**
   * Whether to also look for a local override file (e.g., AGENTS.override.md).
   * Override files are gitignored and contain personal/local overrides.
   * Default: true
   */
  agentDocLoadOverride?: boolean;
};

/** Agent instance managed by AgentManager */
export interface ManagedAgent {
  id: string;
  name: string;
  config: ManagedAgentConfig<Agent | AgentContext>;
  /** The actual Agent instance */
  agent: Agent;
  log: AgentLog;
  /** Convenience accessor for agent.context */
  context: AgentContext;
  tools: ToolSet;
  todoManager: TodoManager | null;
  /**
   * Current agent status. Dynamically reflects `agent.status` so it stays
   * in sync with the live agent (running / thinking / aborted / ...).
   */
  readonly status: Agent["status"];
  error?: string;
  parentId?: string; // For subagent support
  childIds: string[]; // For agent team support
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// AgentManager Class
// ============================================================================

export class AgentManager {
  /** Managed agents by ID */
  private agents: Map<string, ManagedAgent> = new Map();

  /** Unified event bus for in-process listeners and hook scripts */
  private eventBus = new AgentEventBus(
    (event) => this.agents.get(event.agentId) ?? (event.parentId ? this.agents.get(event.parentId) : undefined)
  );

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
   * Emit an agent event. Dispatches to both in-process listeners and hook scripts.
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
  async createManagedAgent(config: ManagedAgentConfig, parentId?: string): Promise<Agent> {
    const {
      id: customId,
      setUp,
      languageModel,
      modelInfo: explicitModelInfo,
      name,
      skillDirs,
      compaction,
      mcpConfigPath,
      ...restConfig
    } = config;

    // Resolve ModelInfo: explicit > registry lookup by model string > null
    const resolvedModelInfo = explicitModelInfo ?? getModel(restConfig.model) ?? null;

    const fsRootPath = getEnv().rootPath;

    const context = new AgentContext({ setUp: setUp as ManagedAgentConfig<AgentContext>["setUp"] });

    const tools = await createTools({ context });

    const log = new AgentLog();

    const todoManager = parentId ? null : new TodoManager();

    const agent = new Agent(restConfig, { id: customId, setUp: setUp as ManagedAgentConfig<Agent>["setUp"] });

    // Set the Vercel AI SDK model
    agent.setModel(languageModel);

    // Set model metadata (for context-aware compaction, default maxTokens, cost tracking)
    if (resolvedModelInfo) {
      agent.setModelInfo(resolvedModelInfo);
      if (resolvedModelInfo.pricing) {
        context.setPricing(resolvedModelInfo.pricing);
      }
      context.setCapabilities(resolvedModelInfo.capabilities);
    }

    // Set tools - convert from Tools record to ToolSet
    agent.setTools(tools);

    agent.setContext(context);

    agent.setLog(log);

    // Load agent documentation (AGENTS.md / CLAUDE.md) for root agents
    // This happens early so the content is available for buildSystemPrompt() on the first call
    if (!parentId) {
      const docResult = await loadAgentDoc({
        rootPath: fsRootPath,
        filenames: config.agentDocFilenames,
        loadOverride: config.agentDocLoadOverride !== false, // Default: true
        logger: log,
      });
      if (docResult.content) {
        const instructions = docResult.overrideContent
          ? `${docResult.content}\n\n## Local Override\n\n${docResult.overrideContent}`
          : docResult.content;
        agent.setAgentDocContent(instructions, docResult.source);
        log.info("system", formatAgentDocResult(docResult));
      }
    }

    // Todo, webfetch, websearch are only for root agents.
    // Subagents get their tools overridden in runSubagent() anyway,
    // but skipping here avoids a useless TodoManager and nag reminders.
    if (!parentId && todoManager) {
      agent.setTodoManager(todoManager);

      agent.addTools({
        webfetch: createWebfetchTool({ agentId: agent.id }),
        websearch: createWebsearchTool({ agentId: agent.id }),
      });
    }

    // Ask-user tool (root agents only — subagents don't interact with users)
    // Client-side tool: no execute function, handled by the CLI via addToolOutput
    if (!parentId) {
      agent.addTools({ ask_user: createAskUserTool() });
    }

    // Load skills and add skill tools (only for root agents, not subagents)
    if (!parentId) {
      const skillRegistry = new SkillRegistry({
        rootPath: fsRootPath,
        logger: log,
      });

      agent.setSkillRegister(skillRegistry);

      // Load skills from configured directories (or default)
      // Default order: env var paths -> user home ~/.agents/skills -> project .agents/skills
      const dirsToLoad = skillDirs ?? (await getDefaultSkillDirs());
      await skillRegistry.loadFromDirectories(dirsToLoad);

      // Add skill tools
      const listSkillsTool = createListSkillsTool({ skillRegistry });
      const loadSkillTool = createLoadSkillTool({ skillRegistry });
      agent.addTools({ list_skills: listSkillsTool, load_skill: loadSkillTool });

      // Add task tool for subagent delegation
      const taskTool = createTaskTool({ parentAgentId: agent.id });
      agent.addTools({ task: taskTool });

      // Set up compaction config (auto-compact runs in prepareStep; manual: CLI /compact)
      // Derive tokenThreshold from model's contextWindow if not explicitly set
      const compactionInput = { ...compaction };
      if (!compactionInput?.tokenThreshold && resolvedModelInfo) {
        const MAX_THRESHOLD = 200_000;
        compactionInput.tokenThreshold = Math.min(resolvedModelInfo.contextWindow, MAX_THRESHOLD);
      }
      const compactionConfig = createCompactionConfig(compactionInput);
      agent.setCompactionConfig(compactionConfig);

      // MCP Integration: connect to configured MCP servers and register their tools (root agents only)
      const mcpManager = new McpManager();
      agent.setMcpManager(mcpManager);
      const mcpConfig = await loadMcpConfig(log, mcpConfigPath);
      if (mcpConfig && Object.keys(mcpConfig.mcpServers).length > 0) {
        const mcpTools = await mcpManager.initialize(mcpConfig, log);
        if (Object.keys(mcpTools).length > 0) {
          agent.addTools(mcpTools);
        }
      }

      // Memory system: persistent cross-session knowledge (root agents only)
      const memoryManager = new MemoryManager({ rootPath: fsRootPath }, log);
      await memoryManager.initialize();
      agent.setMemoryManager(memoryManager);
      agent.setMemoryContent(memoryManager.getIndexContent());
    }

    // Hook system (root agents only)
    if (!parentId) {
      const hookRegistry = new HookRegistry(fsRootPath);
      try {
        await hookRegistry.load();
        agent.hookRegistry = hookRegistry;
        if (hookRegistry.hasHooks()) {
          log.info("system", "Hooks loaded from .agent-hooks/hooks.json");
        }
      } catch (err) {
        log.warn("system", `Failed to load hooks: ${err}`);
      }
    }

    // Wire unified event dispatch (routes to both listeners and hooks)
    agent.dispatchEvent = (event) => this.emit(event);

    // Session persistence (root agents only)
    if (!parentId) {
      const sessionStore = new SessionStore();
      agent.setSessionStore(sessionStore, {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        provider: languageModel?.provider ?? "unknown",
        model: restConfig.model,
      });
    }

    const id = agent.id;

    const managedAgent: ManagedAgent = {
      id,
      name,
      config,
      agent,
      context,
      tools: tools as ToolSet,
      log,
      todoManager,
      get status() {
        return agent.status;
      },
      parentId,
      childIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.agents.set(id, managedAgent);

    // If this is a subagent, register with parent
    if (parentId) {
      const parent = this.agents.get(parentId);
      if (parent) {
        parent.childIds.push(id);
        parent.updatedAt = Date.now();
      }
    }

    // Emit session:start event (dispatches to both listeners and hooks)
    if (!parentId) {
      this.emit({
        type: "session:start",
        agentId: id,
        data: { session_id: agent.getSessionData()?.id ?? id, cwd: fsRootPath },
      });
    }

    return agent;
  }

  /**
   * Spawn a subagent from a parent agent
   */
  async spawnSubagent(parentId: string, config: Partial<ManagedAgentConfig>): Promise<Agent> {
    const parent = this.agents.get(parentId);
    if (!parent) {
      throw new Error(`Parent agent not found: ${parentId}`);
    }
    const finalConfig = { ...parent.config, ...config };
    return await this.createManagedAgent(finalConfig, parentId);
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
    const activeStatuses = new Set<Agent["status"]>(["running", "thinking", "responding", "waiting", "compacting"]);
    const result: ManagedAgent[] = [];

    const walk = (agentId: string) => {
      const managed = this.agents.get(agentId);
      if (!managed) return;
      // Recurse into children first (deepest-first ordering)
      for (const childId of [...managed.childIds].reverse()) {
        walk(childId);
      }
      // Include this node if it is a subagent (has parent) and currently active
      if (managed.parentId && activeStatuses.has(managed.status)) {
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
    managedAgent.agent.mcpManager?.forceKill();

    // Abort the agent if running
    managedAgent.agent.abort("Agent destroyed");

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

    const { agent, context, todoManager } = managed;
    const store = agent.getSessionStore();
    if (!store) throw new Error("Session store not available");

    const session = await store.load(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    // Reset context before restoring — clears old session's usage, cost, messages
    context.reset();

    // Restore messages and compaction state
    const messages = await convertToModelMessages(session.uiMessages);
    context.setMessages(messages);
    context.setSummaryMessage(session.summaryMessage ?? null);
    context.setCompactIndex(session.compactIndex ?? 0);

    // Restore accumulated usage to totalUsage (not per-step usage).
    // Per-step `usage` tracks the current context window fill and gets set
    // naturally by the next LLM call — pre-filling it with totals would
    // make getTokenLimitPercent() report an incorrect 100%.
    if (session.usage) {
      context.addTotalUsage(session.usage);
    }

    // Restore the last SDK-reported context window fill so
    // getTokenLimitPercent() shows the correct percentage before the first LLM call.
    if (session.contextTokens) {
      context.updateUsage({ inputTokens: session.contextTokens, outputTokens: 0, totalTokens: session.contextTokens });
    }
    if (session.cost != null) {
      context.setTotalCost(session.cost);
    }

    // Restore todos
    if (todoManager) {
      if (session.todos?.length) {
        todoManager.restoreTodos(session.todos);
      } else {
        todoManager.reset();
      }
    }

    // Update agent's session reference
    agent.setSessionData(session);

    return {
      uiMessages: session.uiMessages as UIMessage[],
      session: {
        id: session.id,
        name: session.name,
        version: session.version,
        provider: session.provider,
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

    const store = managed.agent.getSessionStore();
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

    const store = managed.agent.getSessionStore();
    if (!store) return [];

    return (await store.list()) as unknown as SessionData[];
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
