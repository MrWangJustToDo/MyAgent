import { AgentLog, type Tools } from "../agent";
import { AgentContext } from "../agent/agentContext";
import { Agent } from "../agent/loop/Agent.js";

import { sandboxManager } from "./SandboxManager";
import { toolsManager } from "./ToolsManager";

import type { AgentConfig } from "../agent/loop/Agent.js";
import type { Sandbox } from "../environment";
import type { AnyTextAdapter } from "@tanstack/ai";

// ============================================================================
// Types & Schemas
// ============================================================================

/** Status of a managed agent */
// export type ManagedAgentStatus = "idle" | "initializing" | "running" | "completed" | "error" | "aborted" | "paused";

export type ManagedAgentConfig<T = Agent | AgentContext> = AgentConfig & {
  name: string;
  rootPath: string;
  adapter: AnyTextAdapter;
  setUp?: (instance: T) => T;
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
  tools: Tools;
  sandbox: Sandbox;
  status: Agent["status"];
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

  // ============================================================================
  // Agent Lifecycle
  // ============================================================================

  /**
   * Create a new agent
   */
  async createManagedAgent(_config: ManagedAgentConfig, parentId?: string): Promise<Agent> {
    const { rootPath, setUp, adapter, ...config } = _config;

    const sandbox = await sandboxManager.getSandbox(rootPath);

    const tools = await toolsManager.getTools(rootPath);

    const context = new AgentContext({ setUp: setUp as ManagedAgentConfig<AgentContext>["setUp"] });

    const log = new AgentLog();

    const agent = new Agent(config, { setUp: setUp as ManagedAgentConfig<Agent>["setUp"] });

    agent.setAdapter(adapter);

    agent.setTools(tools);

    agent.setSandbox(sandbox);

    agent.setContext(context);

    agent.setLog(log);

    const id = agent.id;

    const managedAgent: ManagedAgent = {
      id,
      name: config.name,
      config: _config,
      agent,
      context,
      sandbox,
      tools,
      log,
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
  async spawnSubagent(parentId: string, config: ManagedAgentConfig): Promise<Agent> {
    const parent = this.agents.get(parentId);
    if (!parent) {
      throw new Error(`Parent agent not found: ${parentId}`);
    }
    return await this.createManagedAgent(config, parentId);
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
