import type { z } from "zod";

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
  inputSchema: z.ZodSchema;
  outputSchema?: z.ZodSchema;
  execute: (input: unknown, options: ToolExecutionOptions) => Promise<ToolCallResult>;
  toUI?: (result: unknown) => string;
}

// ============================================================================
// Command registration (slash commands)
// ============================================================================

export interface ExtensionCommand {
  name: string;
  description: string;
  execute: (args: string[]) => Promise<string | void>;
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
// Union type for tool lifecycle events
// ============================================================================

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
}

// ============================================================================
// Extension context (provided by the runner to each extension)
// ============================================================================

export interface ExtensionContext {
  id: string;
  env: Record<string, string>;

  registerTool(def: ExtensionToolDefinition): void;
  registerCommand(cmd: ExtensionCommand): void;
  registerInterceptor<T extends InterceptableEvent>(eventType: string, handler: EventInterceptor<T>): () => void;

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
}

export interface ExtensionFactory {
  create(): Promise<ExtensionAPI> | ExtensionAPI;
}

// ============================================================================
// Extension instance (internal)
// ============================================================================

export interface ExtensionInstance {
  api: ExtensionAPI;
  context: ExtensionContext;
  state: "inactive" | "active" | "error";
  error?: Error;
}

// ============================================================================
// Extension configuration
// ============================================================================

export interface ExtensionConfig {
  id: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
}
