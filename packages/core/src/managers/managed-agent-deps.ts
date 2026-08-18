import type { AgentManager } from "./agent-manager.js";
import type { AgentRunDeps } from "./agent-run-deps.js";
import type { ManagedAgent } from "./managed-agent.js";

/** Build {@link AgentRunDeps} for middleware and runner construction. */
export function buildManagedAgentDeps(managed: ManagedAgent, manager: AgentManager): AgentRunDeps {
  return {
    agentId: managed.id,
    manager,
    usage: managed.usage,
    memory: managed.memory,
    session: managed.session,
    log: managed.log,
    todoManager: managed.todoManager,
    extensionRunner: managed.extensionRunner,
    compactionConfig: managed.getCompactionConfig(),
    modelInfo: managed.getModelInfo(),
    getFrozenSystemPrompt: () => managed.getFrozenSystemPrompt(),
    getUIChannel: () => managed.ui ?? null,
    shouldTriggerAutoCompact: (messages) => managed.shouldTriggerAutoCompact(messages),
  };
}
