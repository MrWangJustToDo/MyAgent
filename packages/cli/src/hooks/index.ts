// ============================================================================
// CLI Hooks
// ============================================================================

// Local chat hook (uses TanStack AI useChat with local connection)
export { useLocalChat, type UseLocalChatConfig, type UseLocalChatReturn } from "./use-local-chat.js";

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
} from "./use-args.js";

export { useUserInput, getInputActions, type UserInputState } from "./use-user-input.js";

export { useSize } from "./use-size.js";

export { useTodoManager, type TodoStats } from "./use-todo-manager.js";

// Re-export TanStack AI types for UI rendering
export type { UIMessage, TextPart, ToolCallPart, ToolResultPart, ThinkingPart, MessagePart } from "@my-agent/core";
