/**
 * Managers module - class-based state management
 *
 * @example
 * ```typescript
 * import { agentManager } from '@my-agent/core';
 *
 * const agent = await agentManager.createManagedAgent({
 *   name: "main",
 *   languageModel: model,
 * });
 * ```
 */

export {
  AgentManager,
  agentManager,
  getDefaultSkillDirs,
  SKILL_DIRS_ENV_VAR,
  type ManagedAgentConfig,
  type ManagedAgent,
} from "./manager-agent.js";

export { AgentEventBus, type AgentEventType, type AgentEvent, type AgentEventListener } from "./agent-event-bus.js";
