import type { ExtensionZod } from "./extension-zod.js";
import type { CoreEnv } from "../../env.js";
import type { ModelToolContent, ToModelOutputContext } from "../tools/runtime/to-model-output-registry.js";
import type { SchemaInput } from "@tanstack/ai";

export type { ExtensionZod } from "./extension-zod.js";

// ============================================================================
// Tool execution types (mirrored from @tanstack/ai to avoid ai package dep)
// ============================================================================

export interface ToolExecutionOptions {
  toolCallId: string;
  abortSignal?: AbortSignal;
}

export type ToolCallResult = Record<string, unknown>;

// ============================================================================
// Lifecycle Hooks
// ============================================================================

export type ExtensionLifecycleEvent = "bootstrap" | "activate" | "deactivate" | "destroy";

// ============================================================================
// Tool registration
// ============================================================================

export interface ExtensionToolDefinition {
  name: string;
  description: string;
  /**
   * Any Standard-Schema / JSON-Schema compliant schema (Zod, ArkType, Valibot, or a plain JSON Schema object).
   * Not locked to Zod — see {@link ExtensionContext.z} for the convenience Zod API.
   */
  inputSchema: SchemaInput;
  outputSchema?: SchemaInput;
  execute: (input: unknown, options: ToolExecutionOptions) => Promise<ToolCallResult>;
  toUI?: (result: unknown) => string;
  /** Optional model-facing output transform (registered on the TanStack tool). */
  toModelOutput?: (ctx: ToModelOutputContext) => Promise<ModelToolContent> | ModelToolContent;
  /**
   * Lazy tools are excluded from the initial request; the model discovers them by
   * name via the synthetic `__lazy__tool__discovery__` tool. Keeps low-usage tools
   * available without per-turn token cost. Defaults to false (eager).
   */
  lazy?: boolean;
}

// ============================================================================
// Command registration (slash commands)
// ============================================================================

export interface ExtensionCommandOption {
  label: string;
  value: string;
  description?: string;
}

export interface ExtensionCommand {
  name: string;
  description: string;
  execute: (args: string[]) => Promise<string | void>;
  /**
   * Optional: provide secondary-menu options for this command (e.g. `/resume`
   * lists recent sessions). The app's autocomplete shows these as a browseable
   * list when the user types `/name ` (after selecting the command). Each option
   * is executed as `/name <value>`.
   */
  getOptions?: (args: string[]) => ExtensionCommandOption[] | Promise<ExtensionCommandOption[]>;
  /**
   * Optional: when set, the dispatch layer injects the returned text as a user
   * message into the session (via chat.sendMessage) after `execute` resolves,
   * triggering a model turn. Use this to have a slash command drive the agent
   * (e.g. `/skill <name>` expanding the skill body into the conversation).
   * Returning undefined (or an empty string) skips injection.
   */
  injectMessage?: (args: string[], result: string | void) => string | undefined | Promise<string | undefined>;
}

// ============================================================================
// Interceptable Events (ExtensionEventBus)
// ============================================================================

export interface InterceptableEvent<TPayload = unknown, TReturn = unknown> {
  type: string;
  payload: TPayload;
  defaultReturn?: TReturn;
  skipDefault?: boolean;
}

export type EventInterceptor<TEvent extends InterceptableEvent> = (
  event: TEvent
) => Promise<boolean | void> | boolean | void;

// ============================================================================
// Tool control events (interceptors mutate the event to signal actions)
// ============================================================================

export interface ToolBeforePayload {
  toolName: string;
  args: unknown;
  sessionId: string;
}

export interface ToolBeforeEvent extends InterceptableEvent<ToolBeforePayload> {
  type: `tool:before:${string}`;
  payload: ToolBeforePayload;
  /** Set by interceptor to skip the tool call */
  skip?: boolean;
  /** Optional reason when skipping */
  reason?: string;
  /** Set by interceptor to modify tool arguments before execution */
  modifiedArgs?: unknown;
}

export interface ToolAfterPayload {
  toolName: string;
  args: unknown;
  result: unknown;
  durationMs: number;
  /** Set by an interceptor to replace the tool result returned to the model. */
  modifiedResult?: unknown;
}

export interface ToolAfterEvent extends InterceptableEvent<ToolAfterPayload> {
  type: `tool:after:${string}`;
  payload: ToolAfterPayload;
}

export interface ToolErrorPayload {
  toolName: string;
  args: unknown;
  error: string;
}

export interface ToolErrorEvent extends InterceptableEvent<ToolErrorPayload> {
  type: `tool:error:${string}`;
  payload: ToolErrorPayload;
}

// ============================================================================
// Per-turn prompt hooks (before_agent_start)
// ============================================================================

export interface BeforeAgentStartPayload {
  /** User prompt text for this turn (or a placeholder when structured-only). */
  prompt: string;
  /** Root agent / session id. */
  sessionId: string;
}

/**
 * Interceptable event fired once per user prompt before turn-context snapshot.
 * Handlers mutate `appendTurnContext` / `appendSystemPrompt`; the runner concatenates
 * contributions across handlers (append-only — does not replace the frozen system prompt).
 */
export interface BeforeAgentStartEvent extends InterceptableEvent<BeforeAgentStartPayload> {
  type: "before_agent_start";
  payload: BeforeAgentStartPayload;
  /** Appended into the `<extension_context>` ctx section for this user turn. */
  appendTurnContext?: string;
  /** Appended after DYNAMIC_BOUNDARY for this turn only (outside ctx sections). */
  appendSystemPrompt?: string;
}

export type TurnContextProvider = () => string | undefined | Promise<string | undefined>;

export interface ExtensionPromptAppends {
  turnContext?: string;
  systemAppend?: string;
}

// ============================================================================
// Union type for tool lifecycle events
// ============================================================================

// ============================================================================
// Session lifecycle events (per-agent ExtensionEventBus)
// ============================================================================

export interface SessionStartPayload {
  /** Working directory (rootPath) of the agent session. */
  cwd: string;
  /** Root agent / session id. */
  sessionId: string;
}

export interface SessionStartEvent extends InterceptableEvent<SessionStartPayload> {
  type: "session:start";
  payload: SessionStartPayload;
}

export interface SessionShutdownPayload {
  /** Root agent / session id. */
  sessionId: string;
}

export interface SessionShutdownEvent extends InterceptableEvent<SessionShutdownPayload> {
  type: "session:shutdown";
  payload: SessionShutdownPayload;
}

export type ToolLifecycleEvent = ToolBeforeEvent | ToolAfterEvent | ToolErrorEvent;

export interface ExtensionEventBus {
  emit<T extends InterceptableEvent>(event: T): Promise<T["defaultReturn"] | undefined>;
  on<T extends InterceptableEvent>(type: string, handler: EventInterceptor<T>): () => void;
  off<T extends InterceptableEvent>(type: string, handler: EventInterceptor<T>): void;
}

// ============================================================================
// UI bridge (app-layer only)
// ============================================================================

export interface ExtensionUI {
  notify(type: string, data: unknown): void;
  subscribe<T = unknown>(type: string, handler: (data: T) => void): () => void;
  /**
   * Set a status-bar entry for this extension (rendered by the host UI, e.g. footer).
   * Degrades gracefully: publishes a `set-status` notification the host can render.
   */
  setStatus(key: string, text: string): void;
  /**
   * Read the current status entries (key → text) set via {@link setStatus}.
   * Lets a host reconcile state that changed before it subscribed (e.g. during
   * bootstrap, before the app's `set-status` subscription mounts).
   */
  getStatus(): Readonly<Record<string, string>>;
  /**
   * Minimal theme helper: colorize `text` for a given semantic color name.
   * Returns a plain string (host decides whether/how to render ANSI color).
   */
  theme: { fg(color: string, text: string): string };
}

// ============================================================================
// Extension context (provided by the runner to each extension)
// ============================================================================

export interface ExtensionContext {
  id: string;
  env: Record<string, string>;
  /** Working directory (rootPath) of the agent session. */
  cwd: string;
  /**
   * Runtime-agnostic environment: filesystem, shell, fetch, path utilities, env vars,
   * and rootPath — the single source of truth for host capabilities. Lets extensions
   * perform real I/O (read files, run commands, fetch) without importing host-specific APIs.
   */
  coreEnv: CoreEnv;

  /**
   * Host-provided Zod `z` API (same package version as core).
   * Extension modules should use `ctx.z` for schemas — do not `import` zod yourself.
   */
  z: ExtensionZod;

  registerTool(def: ExtensionToolDefinition): void;
  registerCommand(cmd: ExtensionCommand): void;
  registerInterceptor<T extends InterceptableEvent>(eventType: string, handler: EventInterceptor<T>): () => void;
  /**
   * Register a callback that contributes turn-context text each user turn.
   * Returns an unsubscribe function.
   */
  registerTurnContextProvider(fn: TurnContextProvider): () => void;

  events: ExtensionEventBus;
  ui: ExtensionUI;

  logger: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
}

// ============================================================================
// Extension API
// ============================================================================

export interface ExtensionAPI {
  id: string;
  name: string;
  version: string;
  description: string;

  activate(ctx: ExtensionContext): Promise<void> | void;
  deactivate?(): Promise<void> | void;

  /**
   * Optional notice injected into turn-context when this extension is disabled at
   * runtime (via `setEnabled(false)`), so the model knows its tools/commands are
   * gone. Return a string to customize what the model sees; return empty/undefined
   * to fall back to the runner's default notice. Called only when disabling, never
   * for config-level opt-out (where the extension is never created).
   */
  disabledNotice?(): string | void;
}

export interface ExtensionFactory {
  create(): Promise<ExtensionAPI> | ExtensionAPI;
}

// ============================================================================
// Extension instance (internal)
// ============================================================================

/** Tracks everything an extension registered, so disabling can unregister it. */
export interface ExtensionRegistrations {
  /** Tool names registered by this extension. */
  tools: string[];
  /** Command names registered by this extension. */
  commands: string[];
  /** Unsubscribe callbacks for event-bus interceptors. */
  unsubInterceptors: Array<() => void>;
  /** Unsubscribe callbacks for turn-context providers. */
  unsubTurnContext: Array<() => void>;
}

export interface ExtensionInstance {
  api: ExtensionAPI;
  context: ExtensionContext;
  state: "inactive" | "active" | "error";
  error?: Error;
  /** Artifacts this extension registered (used by enable/disable). */
  registrations: ExtensionRegistrations;
}

/** Public, read-only description of a loaded extension (for management commands). */
export interface ExtensionInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  /** Whether the extension is currently active (enabled) and running. */
  enabled: boolean;
  /** "active" | "error" | "inactive" */
  state: ExtensionInstance["state"];
  error?: string;
  /** Tools this extension registered (when enabled). */
  tools: string[];
  /** Commands this extension registered (when enabled), with whether each exposes secondary-menu options. */
  commands: Array<{ name: string; hasOptions: boolean }>;
}

// ============================================================================
// Extension configuration
// ============================================================================

export interface ExtensionConfig {
  id: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
}
