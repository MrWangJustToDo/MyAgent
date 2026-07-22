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

// Components
export { StreamingOutputView } from "./components/StreamingOutputView.js";

// Hooks
export * from "./hooks";

// Commands
export {
  clearExtensionCommands,
  dispatchCommand,
  extensionCommandToSlashCommand,
  getAllCommands,
  getCommand,
  registerExtensionCommand,
  splitExtensionCommandArgs,
  syncExtensionCommands,
} from "./commands";
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
export {
  dedupeToolCallsInMessages,
  mergeToolCallPart,
  computeToolCallsRenderSignature,
  normalizeToolPartsInMessages,
  shouldFlattenPart,
} from "./utils/dedupe-tool-calls.js";
export { getUiToolState, isToolCallPart, isToolExecuting, parseToolInput } from "./utils/tool-part.js";

// Types
export type { Attachment } from "./types/attachment.js";

export { initHighlighter } from "ink-stream-markdown";
export { configureEnv } from "reactivity-store";
