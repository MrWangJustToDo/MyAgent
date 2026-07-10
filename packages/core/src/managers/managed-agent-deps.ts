import type { AgentRunDeps } from "./agent-run-deps.js";
import type { ManagedAgent } from "./managed-agent.js";
import type { AgentManager } from "./manager-agent.js";

/** Build {@link AgentRunDeps} for middleware and runner construction. */
export function buildManagedAgentDeps(managed: ManagedAgent, manager: AgentManager): AgentRunDeps {
  return {
    agentId: managed.id,
    manager,
    context: managed.context,
    usage: managed.usage,
    memory: managed.memory,
    session: managed.session,
    log: managed.log,
    todoManager: managed.todoManager,
    hookRegistry: managed.hookRegistry,
    compactionConfig: managed.getCompactionConfig(),
    modelInfo: managed.getModelInfo(),
    getDynamicTurnContext: () => managed.getDynamicTurnContext(),
    shouldTriggerAutoCompact: (messages) => managed.shouldTriggerAutoCompact(messages),
  };
}
