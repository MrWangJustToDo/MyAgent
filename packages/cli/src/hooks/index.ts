// ============================================================================
// CLI Hooks
// ============================================================================

// Agent state management hooks (use reactivity-store for React integration)
export { useAgent, getAgentActions, type AgentState } from "./useAgent.js";
export { useAgentContext } from "./useAgentContext.js";

// CLI-specific hooks
export {
  useArgs,
  initArgs,
  parseArgs,
  getFlag,
  getFlagString,
  getFlagNumber,
  getFlagBoolean,
  type ParsedArgs,
  type AgentConfig,
} from "./useArgs.js";

export { useUserInput, getInputActions, type UserInputState } from "./useUserInput.js";

// Re-export types from core for convenience
export type {
  // Agent types
  AgentStatus,
  AgentRunResult,
  AgentContext,
  // Message types (new)
  Message,
  UserMessage,
  AssistantMessage,
  ToolMessage,
  // Run types
  Run,
  RunStatus,
  // Tool types
  ToolCall,
  ToolStatus,
  TokenUsage,
  ContextData,
} from "@my-agent/core";
