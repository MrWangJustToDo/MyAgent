/**
 * Local AgentSessionHost — wraps AgentManager + LocalAgentSession.
 *
 * Bootstrap resume (`continueSession` / `resumeSessionId` on create) calls the same
 * {@link ManagedAgent.restoreSession} path as Session command `session.resume`.
 * Mid-session switches should use `session.dispatch({ type: "session.resume", ... })`.
 */

import { createLocalAgentSession } from "./local-agent-session.js";

import type {
  AgentSessionCreateOptions,
  AgentSessionCreateResult,
  AgentSessionHost,
  AgentSessionListEntry,
} from "./host-types.js";
import type { LocalAgentSessionManager } from "./local-agent-session.js";
import type { AgentSession } from "./types.js";
import type { AgentManager } from "../managers/agent-manager.js";
import type { ManagedAgent, ManagedAgentConfig } from "../managers/managed-agent.js";
import type { UIMessage } from "@tanstack/ai";

/** Minimal manager surface required by the Local Host (AgentManager satisfies this). */
export interface LocalAgentSessionHostManager extends LocalAgentSessionManager {
  createManagedAgent(config: ManagedAgentConfig, parentId?: string): Promise<ManagedAgent>;
  getAgents(): ManagedAgent[];
  destroyAgent(id: string): void;
}

export interface CreateLocalAgentSessionHostOptions {
  manager: LocalAgentSessionHostManager;
}

function toListEntry(managed: ManagedAgent): AgentSessionListEntry {
  return {
    agentId: managed.id,
    name: managed.name,
    ...(managed.parentId ? { parentId: managed.parentId } : {}),
    status: managed.status,
    createdAt: managed.createdAt,
    updatedAt: managed.updatedAt,
  };
}

function toManagedConfig(options: AgentSessionCreateOptions): ManagedAgentConfig {
  return {
    name: options.name,
    model: options.model,
    maxIterations: options.maxIterations ?? 100,
    ...(options.modelStyle ? { modelStyle: options.modelStyle } : {}),
    ...(options.modelBaseURL ? { modelBaseURL: options.modelBaseURL } : {}),
    ...(options.modelApiKey ? { modelApiKey: options.modelApiKey } : {}),
    ...(options.modelInfo ? { modelInfo: options.modelInfo } : {}),
    ...(options.systemPrompt ? { systemPrompt: options.systemPrompt } : {}),
    ...(options.mcpConfigPath ? { mcpConfigPath: options.mcpConfigPath } : {}),
    ...(options.extensionDirs?.length ? { extensionDirs: options.extensionDirs } : {}),
    ...(options.toolConfig ? { toolConfig: options.toolConfig } : {}),
  };
}

/**
 * Bootstrap-time disk restore. Same underlying API as `session.resume` dispatch.
 */
async function restoreInitialMessages(
  managed: ManagedAgent,
  options: AgentSessionCreateOptions
): Promise<UIMessage[] | undefined> {
  if (options.resumeSessionId) {
    const data = await managed.restoreSession(options.resumeSessionId);
    return data.uiMessages;
  }
  if (!options.continueSession) return undefined;

  const store = managed.getSessionStore?.() ?? null;
  if (!store) return undefined;
  const latest = await store.getLatest();
  if (!latest) return undefined;
  const data = await managed.restoreSession(latest.id);
  return data.uiMessages;
}

class LocalAgentSessionHostImpl implements AgentSessionHost {
  private readonly manager: LocalAgentSessionHostManager;

  constructor(options: CreateLocalAgentSessionHostOptions) {
    this.manager = options.manager;
  }

  async create(options: AgentSessionCreateOptions): Promise<AgentSessionCreateResult> {
    const managed = await this.manager.createManagedAgent(toManagedConfig(options));
    const initialMessages = await restoreInitialMessages(managed, options);
    const initial = initialMessages ?? [];

    // Chat controller stays behind Session; adapters must not call ManagedAgent.initChat.
    managed.initChat(this.manager as AgentManager, initial);
    managed.syncInteractionStateFromUIMessages(initial);

    const session = createLocalAgentSession({
      managed,
      manager: this.manager,
    });

    return { session, ...(initial.length ? { initialMessages: initial } : {}) };
  }

  connect(agentId: string): AgentSession | null {
    const managed = this.manager.getAgent(agentId);
    if (!managed) return null;
    return createLocalAgentSession({
      managed,
      manager: this.manager,
    });
  }

  list(): AgentSessionListEntry[] {
    return this.manager.getAgents().map(toListEntry);
  }

  async destroy(agentId: string): Promise<void> {
    this.manager.destroyAgent(agentId);
  }
}

/**
 * Create an in-process AgentSessionHost backed by an AgentManager (or test double).
 */
export function createLocalAgentSessionHost(options: CreateLocalAgentSessionHostOptions): AgentSessionHost {
  return new LocalAgentSessionHostImpl(options);
}
