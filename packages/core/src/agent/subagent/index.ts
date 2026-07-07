// Types and constants
export {
  SUBAGENT_DEFAULT_MAX_ITERATIONS,
  SUBAGENT_DEFAULT_MAX_OUTPUT_LENGTH,
  type SubagentConfig,
  type SubagentResult,
} from "./types.js";

// System prompt
export { buildExploreSystemPrompt, SUBAGENT_EXPLORE_SYSTEM_PROMPT } from "./prompt.js";

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
  splitStepSegments,
  SUMMARY_STREAM_MIN_CHARS,
} from "./extract-assistant-text.js";
