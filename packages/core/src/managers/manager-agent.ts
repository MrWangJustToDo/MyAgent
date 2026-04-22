import * as os from "os";
import * as path from "path";

import { AgentLog } from "../agent";
import { AgentContext } from "../agent/agent-context";
import { createCompactionConfig } from "../agent/compaction/types.js";
import { Agent } from "../agent/loop/Agent.js";
import { loadMcpConfig } from "../agent/mcp/config.js";
import { McpManager } from "../agent/mcp/manager.js";
import { SkillRegistry } from "../agent/skills/skill-registry.js";
import { TodoManager } from "../agent/todo-manager";
import { createCompactTool } from "../agent/tools/compact-tool.js";
import { createListSkillsTool } from "../agent/tools/list-skills-tool.js";
import { createLoadSkillTool } from "../agent/tools/load-skill-tool.js";
import { createTaskTool } from "../agent/tools/task-tool.js";

import { sandboxManager } from "./manager-sandbox.js";
import { toolsManager } from "./manager-tools.js";

import type { CompactionConfigInput } from "../agent/compaction/types.js";
import type { AgentConfig, ToolSet } from "../agent/loop/Agent.js";
import type { Sandbox } from "../environment";
import type { LanguageModel } from "ai";

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
export function getDefaultSkillDirs(): string[] {
  const dirs: string[] = [];

  // 1. Environment variable paths (highest priority)
  const envDirs = process.env[SKILL_DIRS_ENV_VAR];
  if (envDirs) {
    const parsedDirs = envDirs
      .split(",")
      .map((d) => d.trim())
      .filter((d) => d.length > 0);
    dirs.push(...parsedDirs);
  }

  // 2. User home directory (global skills)
  const userSkillDir = path.join(os.homedir(), ".agents", "skills");
  dirs.push(userSkillDir);

  // 3. Current project directory (project-specific skills, lowest priority)
  dirs.push(".agents/skills");

  return dirs;
}

export type ManagedAgentConfig<T = Agent | AgentContext> = AgentConfig & {
  /** Optional custom ID for the agent (auto-generated if not provided) */
  id?: string;
  name: string;
  rootPath: string;
  /** Vercel AI SDK LanguageModel instance */
  languageModel: LanguageModel;
  setUp?: (instance: T) => T;
  /** Skill directories to load (relative to rootPath or absolute). Defaults to [".opencode/skills"] */
  skillDirs?: string[];
  /** Compaction configuration for context management */
  compaction?: CompactionConfigInput;
  /** Path to MCP config file (relative to rootPath). Defaults to ".opencode/mcp.json" */
  mcpConfigPath?: string;
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
  sandbox: Sandbox;
  todoManager: TodoManager;
  status: Agent["status"];
  error?: string;
  parentId?: string; // For subagent support
  childIds: string[]; // For agent team support
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// Event Types
// ============================================================================

/** Subagent lifecycle events */
export type SubagentEventType =
  | "subagent:created"
  | "subagent:started"
  | "subagent:step"
  | "subagent:completed"
  | "subagent:error"
  | "subagent:destroyed";

export interface SubagentEvent {
  type: SubagentEventType;
  subagentId: string;
  parentId: string;
  agent: Agent;
  /** Additional data depending on event type */
  data?: {
    /** For step events */
    step?: number;
    finishReason?: string;
    /** For completed events */
    summary?: string;
    iterations?: number;
    /** For error events */
    error?: Error;
  };
}

export type SubagentEventListener = (event: SubagentEvent) => void;

// ============================================================================
// AgentManager Class
// ============================================================================

export class AgentManager {
  /** Managed agents by ID */
  private agents: Map<string, ManagedAgent> = new Map();

  /** Event listeners for subagent lifecycle */
  private eventListeners: Map<SubagentEventType | "*", Set<SubagentEventListener>> = new Map();

  // ============================================================================
  // Event Emitter
  // ============================================================================

  /**
   * Subscribe to subagent events.
   *
   * @param type - Event type or "*" for all events
   * @param listener - Callback function
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * // Listen to specific event
   * const unsubscribe = agentManager.on("subagent:created", (event) => {
   *   console.log(`Subagent ${event.subagentId} created`);
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
  on(type: SubagentEventType | "*", listener: SubagentEventListener): () => void {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, new Set());
    }
    this.eventListeners.get(type)!.add(listener);

    return () => {
      this.eventListeners.get(type)?.delete(listener);
    };
  }

  /**
   * Emit a subagent event.
   */
  emit(event: SubagentEvent): void {
    // Notify specific listeners
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch {
          // Ignore listener errors
        }
      }
    }

    // Notify wildcard listeners
    const wildcardListeners = this.eventListeners.get("*");
    if (wildcardListeners) {
      for (const listener of wildcardListeners) {
        try {
          listener(event);
        } catch {
          // Ignore listener errors
        }
      }
    }
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
      rootPath,
      setUp,
      languageModel,
      name,
      skillDirs,
      compaction,
      mcpConfigPath,
      ...restConfig
    } = config;

    const sandbox = await sandboxManager.getSandbox(rootPath);

    const tools = await toolsManager.getTools(rootPath);

    const context = new AgentContext({ setUp: setUp as ManagedAgentConfig<AgentContext>["setUp"] });

    const log = new AgentLog();

    const todoManager = new TodoManager();

    const agent = new Agent(restConfig, { id: customId, setUp: setUp as ManagedAgentConfig<Agent>["setUp"] });

    // Set the Vercel AI SDK model
    agent.setModel(languageModel);

    // Set tools - convert from Tools record to ToolSet
    agent.setTools(tools);

    agent.setSandbox(sandbox);

    agent.setContext(context);

    agent.setLog(log);

    agent.setTodoManager(todoManager);

    // Load skills and add skill tools (only for root agents, not subagents)
    if (!parentId) {
      const skillRegistry = new SkillRegistry({
        sandbox,
        rootPath,
        logger: log,
      });

      agent.setSkillRegister(skillRegistry);

      // Load skills from configured directories (or default)
      // Default order: env var paths -> user home ~/.agents/skills -> project .agents/skills
      const dirsToLoad = skillDirs ?? getDefaultSkillDirs();
      await skillRegistry.loadFromDirectories(dirsToLoad);

      // Add skill tools
      const listSkillsTool = createListSkillsTool({ skillRegistry });
      const loadSkillTool = createLoadSkillTool({ skillRegistry });
      agent.addTools({ list_skills: listSkillsTool, load_skill: loadSkillTool });

      // Add task tool for subagent delegation
      const taskTool = createTaskTool({ parentAgentId: agent.id });
      agent.addTools({ task: taskTool });

      // Set up compaction config and tool
      const compactionConfig = createCompactionConfig(compaction);
      agent.setCompactionConfig(compactionConfig);

      const compactTool = createCompactTool({
        getMessages: () => context.getCompactMessages(),
        sandbox,
        agent,
        config: compactionConfig,
        todoManager, // Pass todoManager to check for incomplete todos
        onCompact: (result) => {
          // Apply the compacted messages to context
          context.setCompactMessages(result.messages);
          // Reset token usage since we've compressed the context
          // we should reset after this conversation is done
          context.resetUsage();

          log.info("agent", "Compaction completed", {
            tokensBefore: result.tokensBefore,
            tokensAfter: result.tokensAfter,
            transcriptPath: result.transcriptPath,
          });
        },
      });
      agent.addTools({ compact: compactTool });

      // MCP Integration: connect to configured MCP servers and register their tools (root agents only)
      const mcpManager = new McpManager();
      agent.setMcpManager(mcpManager);
      const mcpConfig = await loadMcpConfig(sandbox, log, mcpConfigPath);
      if (mcpConfig && Object.keys(mcpConfig.mcpServers).length > 0) {
        const mcpTools = await mcpManager.initialize(mcpConfig, log);
        if (Object.keys(mcpTools).length > 0) {
          agent.addTools(mcpTools);
        }
      }
    }

    const id = agent.id;

    const managedAgent: ManagedAgent = {
      id,
      name,
      config,
      agent,
      context,
      sandbox,
      tools: tools as unknown as ToolSet,
      log,
      todoManager,
      status: "idle",
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
