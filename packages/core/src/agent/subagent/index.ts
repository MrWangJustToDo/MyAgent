// Subagent exports
export {
  runSubagent,
  getSubagent,
  destroySubagent,
  createSubagentTools,
  createExploreTools,
  extractSummary,
  truncateSummary,
  // New constants
  SUBAGENT_DEFAULT_MAX_ITERATIONS,
  SUBAGENT_DEFAULT_MAX_OUTPUT_LENGTH,
  SUBAGENT_MAX_RETRIES,
  SUBAGENT_EXPLORE_SYSTEM_PROMPT,
  // Deprecated aliases for backward compatibility
  SUBAGENT_MAX_SUMMARY_LENGTH,
  SUBAGENT_SYSTEM_PROMPT,
  type SubagentConfig,
  type SubagentResult,
  type SubagentResultLegacy,
} from "./subagent.js";
