import { z } from "zod";

import { generateContextId } from "../agent/agentContext";
import { createAgent } from "../agent/loop/Agent.js";

import type { TokenUsage, AgentContext } from "../agent/agentContext";
import type { ToolSet, Agent } from "../agent/loop/Agent.js";
import type { Tools } from "../agent/tools";
import type { Sandbox } from "../environment";
import type { AnyTextAdapter } from "@tanstack/ai";

// ============================================================================
// Types & Schemas
// ============================================================================

/** Status of a managed agent */
export type ManagedAgentStatus = "idle" | "initializing" | "running" | "completed" | "error" | "aborted" | "paused";

/** Configuration for creating a managed agent */
export const ManagedAgentConfigSchema = z.object({
  name: z.string().min(1).describe("Agent name/identifier"),
  model: z.string().min(1).describe("Model name to use"),
  baseURL: z.string().optional().describe("Base URL for the model API"),
  systemPrompt: z.string().optional().describe("System prompt for the agent"),
  maxIterations: z.number().int().min(1).max(100).optional().default(10).describe("Maximum agentic loop iterations"),
  maxTokens: z.number().int().min(1).optional().describe("Maximum tokens per response"),
  temperature: z.number().min(0).max(2).optional().describe("Sampling temperature"),
});

export type ManagedAgentConfig = z.infer<typeof ManagedAgentConfigSchema>;

/** Agent instance managed by AgentManager */
export interface ManagedAgent {
  id: string;
  name: string;
  config: ManagedAgentConfig;
  /** The actual Agent instance */
  agent: Agent;
  /** Convenience accessor for agent.context */
  context: AgentContext;
  status: ManagedAgentStatus;
  error?: string;
  parentId?: string; // For subagent support
  childIds: string[]; // For agent team support
  createdAt: number;
  updatedAt: number;
}

/** Event types for agent lifecycle */
export type AgentEventType =
  | "agent:created"
  | "agent:started"
  | "agent:completed"
  | "agent:error"
  | "agent:aborted"
  | "agent:paused"
  | "agent:resumed"
  | "agent:destroyed"
  | "subagent:spawned"
  | "subagent:completed";

export interface AgentEvent {
  type: AgentEventType;
  agentId: string;
  parentId?: string;
  data?: unknown;
  timestamp: number;
}

// ============================================================================
// AgentManager Class
// ============================================================================

/**
 * AgentManager - Manages agent lifecycle and orchestration.
 *
 * Responsibilities:
 * - Create, track, and destroy agents
 * - Support subagent/agent team patterns
 * - Coordinate shared resources (sandbox, tools, adapter)
 * - Event-driven lifecycle management
 *
 * Design for web platform:
 * - Agents can be serialized for client/server transport
 * - Manager can run on server, agents connect from web clients
 * - Supports multiple concurrent agents
 *
 * @example
 * ```typescript
 * const manager = new AgentManager();
 *
 * // Set shared resources
 * manager.setAdapter(ollamaText("llama3"));
 * manager.setSandbox(sandbox);
 *
 * // Create main agent
 * const mainAgent = manager.createAgent({
 *   name: "main",
 *   model: "llama3",
 *   systemPrompt: "You are a helpful assistant.",
 * });
 *
 * // Run the agent
 * for await (const chunk of mainAgent.agent.run({ prompt: "Hello!" })) {
 *   // Handle chunks
 * }
 *
 * // Listen to events
 * manager.onEvent((event) => {
 *   console.log(`${event.type}: ${event.agentId}`);
 * });
 * ```
 */
export class AgentManager {
  /** Managed agents by ID */
  private agents: Map<string, ManagedAgent> = new Map();

  /** Event listeners */
  private eventListeners: Set<(event: AgentEvent) => void> = new Set();

  /** Shared sandbox (optional - set via setSandbox) */
  private sandbox: Sandbox | null = null;

  /** Shared tools (optional - set via setTools) */
  private tools: Tools | null = null;

  /** Shared adapter (optional - set via setAdapter) */
  private adapter: AnyTextAdapter | null = null;

  /** Custom tools to add to all agents */
  private customTools: ToolSet = [];

  // ============================================================================
  // Resource Management
  // ============================================================================

  /**
   * Set shared adapter for all agents
   */
  setAdapter(adapter: AnyTextAdapter): void {
    this.adapter = adapter;
  }

  /**
   * Get shared adapter
   */
  getAdapter(): AnyTextAdapter | null {
    return this.adapter;
  }

  /**
   * Set shared sandbox for all agents
   */
  setSandbox(sandbox: Sandbox): void {
    this.sandbox = sandbox;
  }

  /**
   * Get shared sandbox
   */
  getSandbox(): Sandbox | null {
    return this.sandbox;
  }

  /**
   * Set shared tools for all agents
   */
  setTools(tools: Tools): void {
    this.tools = tools;
  }

  /**
   * Get shared tools
   */
  getTools(): Tools | null {
    return this.tools;
  }

  /**
   * Add custom tools for all agents
   */
  addTools(tools: ToolSet): void {
    this.customTools = [...this.customTools, ...tools];
  }

  // ============================================================================
  // Agent Lifecycle
  // ============================================================================

  /**
   * Create a new agent
   */
  createManagedAgent(config: ManagedAgentConfig, parentId?: string): ManagedAgent {
    const id = generateContextId().replace("ctx_", "agent_");

    // Create the actual Agent instance
    const agent = createAgent({
      id,
      model: config.model,
      baseURL: config.baseURL,
      systemPrompt: config.systemPrompt,
      maxIterations: config.maxIterations,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
      sandbox: this.sandbox ?? undefined,
      adapter: this.adapter ?? undefined,
      tools: this.customTools,
    });

    const managedAgent: ManagedAgent = {
      id,
      name: config.name,
      config,
      agent,
      context: agent.context,
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

    this.emit({
      type: parentId ? "subagent:spawned" : "agent:created",
      agentId: id,
      parentId,
      timestamp: Date.now(),
    });

    return managedAgent;
  }

  /**
   * @deprecated Use createManagedAgent instead
   */
  createAgent(config: ManagedAgentConfig, parentId?: string): ManagedAgent {
    return this.createManagedAgent(config, parentId);
  }

  /**
   * Spawn a subagent from a parent agent
   */
  spawnSubagent(parentId: string, config: ManagedAgentConfig): ManagedAgent {
    const parent = this.agents.get(parentId);
    if (!parent) {
      throw new Error(`Parent agent not found: ${parentId}`);
    }
    return this.createManagedAgent(config, parentId);
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
   * Update agent status
   */
  updateStatus(id: string, status: ManagedAgentStatus, error?: string): void {
    const managedAgent = this.agents.get(id);
    if (!managedAgent) return;

    const oldStatus = managedAgent.status;
    managedAgent.status = status;
    managedAgent.error = error;
    managedAgent.updatedAt = Date.now();

    // Emit appropriate event
    let eventType: AgentEventType;
    switch (status) {
      case "running":
        eventType = "agent:started";
        break;
      case "completed":
        eventType = managedAgent.parentId ? "subagent:completed" : "agent:completed";
        break;
      case "error":
        eventType = "agent:error";
        break;
      case "aborted":
        eventType = "agent:aborted";
        break;
      case "paused":
        eventType = "agent:paused";
        break;
      case "idle":
      case "initializing":
        // Check for resume from paused
        if (oldStatus === "paused") {
          eventType = "agent:resumed";
        } else {
          return; // No event for other transitions
        }
        break;
      default:
        return;
    }

    this.emit({
      type: eventType,
      agentId: id,
      parentId: managedAgent.parentId,
      data: error ? { error } : undefined,
      timestamp: Date.now(),
    });
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

    this.emit({
      type: "agent:destroyed",
      agentId: id,
      parentId: managedAgent.parentId,
      timestamp: Date.now(),
    });
  }

  /**
   * Destroy all agents
   */
  reset(): void {
    // Destroy root agents (which will cascade to subagents)
    for (const agent of this.getRootAgents()) {
      this.destroyAgent(agent.id);
    }
    this.customTools = [];
  }

  // ============================================================================
  // Event System
  // ============================================================================

  /**
   * Subscribe to agent events
   */
  onEvent(listener: (event: AgentEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /**
   * Emit an event
   */
  private emit(event: AgentEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }

  // ============================================================================
  // Serialization
  // ============================================================================

  /**
   * Get agent summary (for UI display)
   */
  getAgentSummary(id: string): {
    id: string;
    name: string;
    status: ManagedAgentStatus;
    model: string;
    messageCount: number;
    usage: TokenUsage;
    childCount: number;
  } | null {
    const managedAgent = this.agents.get(id);
    if (!managedAgent) return null;

    return {
      id: managedAgent.id,
      name: managedAgent.name,
      status: managedAgent.status,
      model: managedAgent.config.model,
      messageCount: managedAgent.context.getMessageCount(),
      usage: managedAgent.context.usage,
      childCount: managedAgent.childIds.length,
    };
  }

  /**
   * Get all agent summaries
   */
  getAllSummaries(): ReturnType<typeof this.getAgentSummary>[] {
    return this.getAgents()
      .map((a) => this.getAgentSummary(a.id))
      .filter((s): s is NonNullable<typeof s> => s !== null);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Default singleton instance for global use
 */
export const agentManager = new AgentManager();
