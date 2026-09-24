import type { AgentManager } from "./agent-manager.js";
import type { AgentRunDeps } from "./agent-run-deps.js";
import type { ManagedAgent } from "./managed-agent.js";

/**
 * Build the complete {@link AgentRunDeps} surface for runner assembly.
 *
 * The collaborator fields are captured references, which is safe only because they
 * are set once at construction; everything that can change while the (cached) runner
 * is alive is exposed as an accessor instead. See the liveness contract on
 * {@link AgentRunDeps}.
 */
export function buildManagedAgentDeps(managed: ManagedAgent, manager: AgentManager): AgentRunDeps {
  return {
    agentId: managed.id,
    manager,
    usage: managed.usage,
    session: managed.session,
    usageHistory: managed.usageHistory,
    statusController: managed.statusController,
    approvals: managed.approvals,
    run: managed.run,
    planMode: managed.planMode,
    getLog: () => managed.getLog(),
    getTodoManager: () => managed.getTodoManager(),
    getExtensionRunner: () => managed.getExtensionRunner(),
    getCompactionConfig: () => managed.getCompactionConfig(),
    getModelInfo: () => managed.getModelInfo(),
    getToolCompactCache: () => managed.getToolCompactCache(),
    getWireProjectionCache: () => managed.getWireProjectionCache(),
    getSystemPrompt: () => managed.getSystemPrompt(),
    getFrozenSystemPrompt: () => managed.getFrozenSystemPrompt(),
    getUIChannel: () => managed.getUI() ?? null,
    config: managed.config,
    parentId: managed.parentId,
    shouldTriggerAutoCompact: (messages) => managed.shouldTriggerAutoCompact(messages),
    shouldPersistUIMessage: (messages, reason) => managed.maybeSaveSessionUIMessages(messages, reason),
    setIterationProgress: (state) => managed.setIterationProgress(state),
    getDynamicTurnContextSections: () => managed.getDynamicTurnContextSections(),
    getAdmittedContextHashes: () => managed.getAdmittedContextHashes(),
    setAdmittedContextHashes: (hashes) => managed.setAdmittedContextHashes(hashes),
    getTurnContextAdmitMessageCount: () => managed.getTurnContextAdmitMessageCount(),
    setTurnContextAdmitMessageCount: (count) => managed.setTurnContextAdmitMessageCount(count),
    commitSurfacedMemories: () => managed.memory.commitSurfacedMemories(),
  };
}
