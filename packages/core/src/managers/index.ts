/**
 * Internal manager module barrel (not re-exported from package entry).
 */

export { AgentManager, agentManager, getDefaultSkillDirs, SKILL_DIRS_ENV_VAR } from "./agent-manager.js";
export { ManagedAgent, type ManagedAgentConfig } from "./managed-agent.js";
export { buildManagedAgent } from "./agent-factory.js";
export { runManagedAgent, runManagedAgentStream, resolveTextAdapterForManaged } from "./run-agent.js";
