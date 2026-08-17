export { ExtensionRunner } from "./runner.js";
export { ExtensionLoader, normalizeExtensionExport } from "./loader.js";
export { joinExtensionAppendSegments } from "./join-append-segments.js";
export {
  BUILTIN_INSTRUCTION_CONTEXT_ID,
  INSTRUCTION_STATUS_KEY,
  builtinInstructionContext,
  formatInstructionStatusLabel,
} from "./builtin-instruction-context.js";
export {
  DEFAULT_EXTENSION_DIR,
  EXTENSION_DIRS_ENV_VAR,
  getDefaultExtensionDirs,
  isExtensionModuleFile,
  pathToFileUrl,
  resolveExtensionDir,
} from "./paths.js";

export type {
  ExtensionAPI,
  ExtensionFactory,
  ExtensionContext,
  ExtensionConfig,
  ExtensionInstance,
  ExtensionToolDefinition,
  ExtensionCommand,
  ExtensionEventBus,
  ExtensionUI,
  ExtensionZod,
  InterceptableEvent,
  EventInterceptor,
  ExtensionLifecycleEvent,
  ToolBeforeEvent,
  ToolBeforePayload,
  ToolAfterEvent,
  ToolAfterPayload,
  ToolErrorEvent,
  ToolErrorPayload,
  ToolLifecycleEvent,
  BeforeAgentStartEvent,
  BeforeAgentStartPayload,
  SessionStartEvent,
  SessionStartPayload,
  SessionShutdownEvent,
  SessionShutdownPayload,
  ExtensionInfo,
  ExtensionPromptAppends,
  TurnContextProvider,
} from "./types.js";
