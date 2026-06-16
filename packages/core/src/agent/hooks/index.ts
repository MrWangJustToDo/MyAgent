export { HookRegistry } from "./hook-registry.js";
export { runHooks, emitHook } from "./hook-runner.js";
export {
  HOOK_EVENTS,
  HOOKS_DIR,
  HOOKS_CONFIG_FILE,
  DEFAULT_HOOK_TIMEOUT_MS,
  hookConfigSchema,
  hookEntrySchema,
  hookMatcherSchema,
} from "./types.js";

export type {
  HookEventType,
  HookEntry,
  HookMatcher,
  HookConfig,
  HookResult,
  HookEventInput,
  PreToolUseInput,
  PostToolUseInput,
  PostToolUseFailureInput,
  SessionStartInput,
  UserPromptSubmitInput,
  StopInput,
  NotificationInput,
  SubagentStartInput,
  SubagentStopInput,
} from "./types.js";

export type { HookLogger } from "./hook-runner.js";
