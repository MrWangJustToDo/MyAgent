// Types
export type { LogLevel, LogCategory, LogEntry } from "./types.js";

// Schemas
export { logLevelSchema, logCategorySchema, logEntrySchema } from "./schemas.js";

// AgentLog class
export { AgentLog, generateLogId } from "./agent-log.js";

// Crash/exit lifecycle guards (active-log registry + process handlers)
export {
  installAgentLogProcessGuards,
  registerActiveAgentLog,
  unregisterActiveAgentLog,
  flushActiveAgentLogsSync,
} from "./lifecycle-guards.js";
