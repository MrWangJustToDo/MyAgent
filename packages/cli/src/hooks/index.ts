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

export {
  useApprovalState,
  type ApprovalDecision,
  type ApprovalState,
  type ApprovalActions,
} from "./useApprovalState.js";

// Re-export types from core for convenience
export type {
  // Agent types
  AgentStatus,
  AgentContext,
  // Token usage
  TokenUsage,
  // Render parts
  RenderPart,
  UserRenderPart,
  TextRenderPart,
  ReasoningRenderPart,
  ToolRenderPart,
  SourceRenderPart,
  FileRenderPart,
  StepRenderPart,
  ErrorRenderPart,
  ToolCallStatus,
} from "@my-agent/core";
