// Types and constants
export {
  SUBAGENT_DEFAULT_MAX_ITERATIONS,
  SUBAGENT_DEFAULT_MAX_OUTPUT_LENGTH,
  resolveSubagentBridgeUI,
  type SubagentConfig,
  type SubagentResult,
} from "./types.js";

// System prompt
export { buildExploreSystemPrompt, SUBAGENT_EXPLORE_SYSTEM_PROMPT } from "./prompt.js";

export { BEGIN_SUMMARY_TOOL_NAME, createBeginSummaryTool } from "./begin-summary-tool.js";

// Tool creation
export { createSubagentTools, createExploreTools } from "./tools.js";

// Output utilities
export { truncateSummary } from "./output.js";

// Runner
export { runSubagent, getSubagent, destroySubagent, type SubagentRunDeps } from "./run-subagent.js";

export { countSubagentIterations, deriveSubagentRunStats } from "./run-stats.js";
export {
  extractAssistantText,
  getSummaryStreamText,
  hasIncompleteToolCalls,
  resolveTaskRunPhase,
  shouldStreamTaskSummary,
  splitStepSegments,
  SUMMARY_STREAM_MIN_CHARS,
  type TaskRunPhase,
  type TaskSummaryStreamState,
} from "./extract-assistant-text.js";
