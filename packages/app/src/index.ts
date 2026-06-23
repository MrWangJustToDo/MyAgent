// Adapter
export * from "./adapter/types.js";
export {
  createAgentFromConfig,
  clearAdapterHooks,
  type AdapterHooks,
  type CreateAgentOptions,
} from "./adapter/create-agent.js";

// Context
export { AdapterProvider, useAdapter } from "./context/adapter-context.js";

// App
export { App } from "./app/App.js";
export { Agent } from "./app/Agent.js";

// Hooks
export * from "./hooks";

// Commands
export { dispatchCommand, getAllCommands, getCommand } from "./commands";
export type { Command, CommandContext, CommandOption } from "./commands";

// Utils
export { formatToolInput, formatToolOutput, formatToolArgs, formatDuration } from "./utils/format.js";
export {
  getToolCallColor,
  getInlineSummary,
  getCompactOutput,
  buildToolHeader,
  getDurationMs,
  DURATION_THRESHOLD_MS,
} from "./utils/format.js";

// Types
export { attachmentToFileUIPart } from "./types/attachment.js";
export type { Attachment } from "./types/attachment.js";

export { initHighlighter } from "ink-stream-markdown";
export { configureEnv } from "reactivity-store";
