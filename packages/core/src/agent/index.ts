// Agent exports
export {
  Agent,
  AgentConfigSchema,
  type AgentStatus,
  type AgentConfig,
  type AgentRunOptions,
  type ToolSet,
} from "./loop";

export type {
  Tools,
  // Tool output types
  ListFileOutput,
  RunCommandOutput,
  ReadFileOutput,
  WriteFileOutput,
  EditFileOutput,
  GlobOutput,
  GrepOutput,
  TodoOutput,
} from "./tools";

// Context exports
export { AgentContext, generateContextId, type TokenUsage } from "./agent-context";

// Log exports
export {
  AgentLog,
  generateLogId,
  // Schemas
  logLevelSchema,
  logCategorySchema,
  logEntrySchema,
  logFilterSchema,
  // Types
  type LogLevel,
  type LogCategory,
  type LogEntry,
  type LogFilter,
} from "./agent-log";

// TodoManager exports
export {
  TodoManager,
  generateTodoManagerId,
  // Schemas
  todoItemInputSchema,
  todoToolInputSchema,
  // Types
  type TodoItem,
  type TodoItemInput,
  type TodoStatus,
  type TodoPriority,
  type TodoManagerConfig,
  type TodoToolInput,
  // Constants
  TODO_STATUSES,
  TODO_PRIORITIES,
  STATUS_ICONS,
  DEFAULT_MAX_TODOS,
  DEFAULT_NAG_REMINDER_THRESHOLD,
} from "./todo-manager";

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
} from "./subagent";

// Skill exports
export {
  SkillLoader,
  SkillRegistry,
  skillMetadataSchema,
  skillSchema,
  type Skill,
  type SkillMetadata,
  type SkillSummary,
} from "./skills";

// Task tool export (for subagent delegation)
export { createTaskTool, taskOutputSchema, type TaskToolConfig, type TaskOutput } from "./tools/task-tool.js";

// Skill tools export
export {
  createListSkillsTool,
  listSkillsOutputSchema,
  type ListSkillsToolConfig,
  type ListSkillsOutput,
} from "./tools/list-skills-tool.js";

export {
  createLoadSkillTool,
  loadSkillOutputSchema,
  type LoadSkillToolConfig,
  type LoadSkillOutput,
} from "./tools/load-skill-tool.js";

// Compaction exports
export {
  // Types and schemas
  compactionConfigSchema,
  compactionResultSchema,
  transcriptEntrySchema,
  type CompactionConfig,
  type CompactionConfigInput,
  type CompactionResult,
  type TranscriptEntry,
  // Defaults
  DEFAULT_COMPACTION_CONFIG,
  createCompactionConfig,
  // Token estimation
  estimateTokens,
  estimateMessageTokens,
  // Compaction prompt
  COMPACTION_PROMPT,
  buildCompactionPrompt,
  // Micro compaction (Layer 1)
  microCompact,
  // Auto compaction (Layer 2)
  shouldAutoCompact,
  saveTranscript,
  summarizeConversation,
  autoCompact,
  createCompactedMessages,
} from "./compaction";

// Compact tool export
export {
  createCompactTool,
  compactOutputSchema,
  type CompactToolConfig,
  type CompactOutput,
} from "./tools/compact-tool.js";

// MCP exports
export {
  McpManager,
  loadMcpConfig,
  DEFAULT_MCP_CONFIG_PATH,
  mcpConfigSchema,
  mcpServerConfigSchema,
  type McpConfig,
  type McpServerConfig,
  type McpServerConfigStdio,
  type McpServerConfigHttp,
} from "./mcp";
