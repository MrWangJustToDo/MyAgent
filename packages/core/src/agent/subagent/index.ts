// Types and constants
export {
  SUBAGENT_DEFAULT_MAX_ITERATIONS,
  SUBAGENT_DEFAULT_MAX_OUTPUT_LENGTH,
  SUBAGENT_MAX_RETRIES,
  SUBAGENT_MAX_SUMMARY_LENGTH,
  type SubagentConfig,
  type SubagentResult,
  type SubagentResultLegacy,
} from "./types.js";

// System prompt
export { buildExploreSystemPrompt, SUBAGENT_EXPLORE_SYSTEM_PROMPT, SUBAGENT_SYSTEM_PROMPT } from "./prompt.js";

// Tool creation
export { createSubagentTools, createExploreTools } from "./tools.js";

// Output utilities
export { extractSummary, truncateSummary } from "./output.js";

// Runner
export { runSubagent, getSubagent, destroySubagent } from "./runner.js";

// Preview bridge (read-only subagent UI)
export { subagentPreviewStore } from "./subagent-preview-store.js";
export { consumeSubagentUIStream } from "./consume-subagent-ui-stream.js";
export {
  extractAssistantText,
  getSummaryStreamText,
  splitStepSegments,
  SUMMARY_STREAM_MIN_CHARS,
} from "./extract-assistant-text.js";
