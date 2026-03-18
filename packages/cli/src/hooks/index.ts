// ============================================================================
// CLI Hooks
// ============================================================================

// Local chat hook (uses TanStack AI useChat with local connection)
export { useLocalChat, type UseLocalChatConfig, type UseLocalChatReturn } from "./useLocalChat.js";

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
  type CliAgentConfig,
} from "./useArgs.js";

export { useUserInput, getInputActions, type UserInputState } from "./useUserInput.js";

export { useSize } from "./useSize.js";

export { useTodoManager, type TodoStats } from "./useTodoManager.js";

// Re-export TanStack AI types for UI rendering
export type { UIMessage, TextPart, ToolCallPart, ToolResultPart, ThinkingPart, MessagePart } from "@my-agent/core";
