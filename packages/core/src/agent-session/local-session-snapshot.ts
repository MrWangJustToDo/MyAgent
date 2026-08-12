/**
 * Project ManagedAgent → AgentSessionSnapshot (serializable, no live handles).
 */

import type { AgentSessionSnapshot, AgentSessionSubagentSummary } from "./types.js";
import type { ManagedAgent } from "../managers/managed-agent.js";

function subagentDescription(name: string | undefined): string | undefined {
  if (!name) return undefined;
  if (name.startsWith("subagent-")) {
    const rest = name.slice("subagent-".length).trim();
    return rest || undefined;
  }
  return name;
}

interface SubagentCatalog {
  getSubagents(parentId: string): ManagedAgent[];
}

export function buildSubagentSummaries(
  managed: ManagedAgent,
  manager: SubagentCatalog | null | undefined
): AgentSessionSubagentSummary[] {
  if (!manager) return [];
  return manager.getSubagents(managed.id).map((child) => ({
    id: child.id,
    status: child.status,
    name: child.name,
    ...(subagentDescription(child.name) ? { description: subagentDescription(child.name) } : {}),
    ...(child.parentTaskId ? { parentTaskToolCallId: child.parentTaskId } : {}),
    usage: child.usage.getChangeSnapshot(),
  }));
}

export function readLocalAgentSessionSnapshot(
  managed: ManagedAgent,
  manager: SubagentCatalog | null | undefined
): AgentSessionSnapshot {
  const chat = managed.getChatController();
  const todos = managed.todoManager;
  return {
    agentId: managed.id,
    ...(managed.parentId ? { parentId: managed.parentId } : {}),
    name: managed.name,
    status: managed.status,
    error: managed.getError(),
    pendingApprovalCount: managed.getPendingApprovalCount(),
    mode: managed.getAgentMode(),
    lastStreamDurationMs: managed.getLastStreamDurationMs(),
    messages: chat?.getMessages() ?? managed.ui?.getMessages() ?? [],
    queues: chat?.getQueuedMessages() ?? { steer: [], followUp: [] },
    usage: managed.usage.getChangeSnapshot(),
    todos: todos?.getItems() ?? [],
    todosTitle: todos?.getTitle() ?? null,
    plan: managed.getPlanModeState(),
    autoMode: managed.isAutoModeEnabled(),
    mcp: { servers: managed.getMcpManager()?.getServerStatuses() ?? [] },
    extensions: { extensions: managed.extensionRunner?.getExtensionInfos() ?? [] },
    subagents: buildSubagentSummaries(managed, manager),
  };
}
