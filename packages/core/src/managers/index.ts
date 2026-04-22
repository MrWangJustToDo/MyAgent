/**
 * Managers module - class-based state management
 *
 * This module provides manager classes for handling agent, sandbox, and tools lifecycle.
 * These are pure TypeScript classes without any reactivity dependencies.
 *
 * @example
 * ```typescript
 * import { agentManager, sandboxManager, toolsManager } from '@my-agent/core';
 *
 * // Create and manage agents
 * const agent = agentManager.createAgent({
 *   name: "main",
 *   model: "gpt-4",
 *   systemPrompt: "You are helpful.",
 * });
 *
 * // Use sandbox and tools
 * const sandbox = await sandboxManager.getSandbox("/path/to/project");
 * const tools = await toolsManager.getTools("/path/to/project");
 *
 * // Set shared resources
 * agentManager.setSandbox(sandbox);
 * agentManager.setTools(tools);
 * ```
 */

export { SandboxManager, sandboxManager, configureSandboxEnv } from "./manager-sandbox.js";
export { ToolsManager, toolsManager } from "./manager-tools.js";
export {
  AgentManager,
  agentManager,
  getDefaultSkillDirs,
  SKILL_DIRS_ENV_VAR,
  type ManagedAgentConfig,
  type ManagedAgent,
  type SubagentEventType,
  type SubagentEvent,
  type SubagentEventListener,
} from "./manager-agent.js";
