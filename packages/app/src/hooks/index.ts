// ============================================================================
// App Hooks
// ============================================================================

export { useAgentChat, type UseAgentChatReturn, type SendMessageContent } from "./use-agent-chat.js";

export { useConfig, initConfig } from "./use-config.js";

export { useUserInput, getInputActions, type UserInputState } from "./use-user-input.js";

export { useSize } from "./use-size.js";

export { useTodoManager, type TodoStats } from "./use-todo-manager.js";

export { useAgent } from "./use-agent.js";
export { useAgentContext } from "./use-agent-context.js";
export { bumpAgentUsage, useAgentUsage } from "./use-agent-usage.js";
export { useAgentLog } from "./use-agent-log.js";
export { useAgentManager } from "./use-agent-manager.js";
export { useAutocomplete } from "./use-autocomplete.js";
export { useCommandOutput } from "./use-command-output.js";
export { useDiffFileCache } from "./use-diff-file-cache.js";
export { useDynamic } from "./use-dynamic.js";
export { useForceUpdate } from "./use-force-update.js";
export { useInputMode, type InputMode, type FreeformContext } from "./use-input-mode.js";
export { useMessageCache } from "./use-message-cache.js";
export { usePreviewEdit } from "./use-preview-edit.js";
export { useSelect } from "./use-select.js";
export { useStatic } from "./use-static.js";
export { useSubAgents } from "./use-sub-agents.js";
export { useSubagentMessages } from "./use-subagent-messages.js";
export { useSubagentPanel, type SubagentPanelView } from "./use-subagent-panel.js";
export { useTerminalSize } from "./use-terminal-size.js";
export { useStreamingOutput, type UseStreamingOutputOptions } from "./use-streaming-output.js";
export { useLiveElapsedMs } from "./use-live-elapsed.js";

export type { UIMessage, TextPart, ToolCallPart, ToolResultPart, ThinkingPart, MessagePart } from "@tanstack/ai";
