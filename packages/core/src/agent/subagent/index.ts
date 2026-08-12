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

export { createTaskTool, taskOutputSchema, type TaskOutput, type TaskToolConfig } from "./task-tool.js";

// Tool creation
export { createSubagentTools } from "./tools.js";

// Output utilities
export { truncateSummary } from "./output.js";

// Runner
export { runSubagent, getSubagent, destroySubagent, type SubagentRunDeps } from "./run-subagent.js";

export { countSubagentIterations, deriveSubagentRunStats, hasBeginSummaryCall } from "./run-stats.js";
