// ============================================================================
// CLI Hooks
// ============================================================================

export { useAgent, getAgentActions, type AgentState, type AgentStatus } from "./useAgent.js";

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
  useUserTools,
  getToolsActions,
  type ToolItem,
  type ToolItemState,
  type UserToolsState,
} from "./useUserTools.js";
