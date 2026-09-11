import { getEnv, hasCoreEnv } from "../../env.js";
import { createAgentEventBus } from "../agent-event-bus";

import { z } from "./extension-zod.js";
import { fingerprintOf, normalizePayload, slotId } from "./render-payload.js";

import type {
  ExtensionInstance,
  ExtensionAPI,
  ExtensionContext,
  ExtensionConfig,
  ExtensionToolDefinition,
  ExtensionCommand,
  InterceptableEvent,
  EventInterceptor,
  ExtensionEventBus,
  ExtensionUI,
  BeforeAgentStartEvent,
  ExtensionPromptAppends,
  ExtensionTurnContextSection,
  ExtensionContextProvider,
  ExtensionRegistrations,
  ExtensionInfo,
  ExtensionNotificationLevel,
  ExtensionRenderPayload,
  ExtensionUiContext,
} from "./types.js";
import type { CoreEnv } from "../../env.js";
import type { AgentEventBus } from "../agent-event-bus";
import type { AgentLog } from "../agent-log/agent-log.js";

// ============================================================================
// ExtensionEventBus implementation
// ============================================================================

/**
 * {@link ExtensionEventBus} backed by the unified {@link AgentEventBus}.
 * Interception (async, ordered, shared mutable event, cancel short-circuit) is
 * delegated to the unified bus's `intercept` mode; hook names are unchanged.
 */
class BusExtensionEventBus implements ExtensionEventBus {
  private readonly disposers = new Map<EventInterceptor<InterceptableEvent>, () => void>();

  constructor(private readonly bus: AgentEventBus) {}

  async emit<T extends InterceptableEvent>(event: T): Promise<T["defaultReturn"] | undefined> {
    return this.bus.intercept(event);
  }

  on<T extends InterceptableEvent>(type: string, handler: EventInterceptor<T>): () => void {
    const key = handler as EventInterceptor<InterceptableEvent>;
    const unsub = this.bus.onIntercept(type, handler);
    this.disposers.set(key, unsub);
    return () => {
      this.disposers.delete(key);
      unsub();
    };
  }

  off<T extends InterceptableEvent>(type: string, handler: EventInterceptor<T>): void {
    void type;
    const key = handler as EventInterceptor<InterceptableEvent>;
    const unsub = this.disposers.get(key);
    if (unsub) {
      this.disposers.delete(key);
      unsub();
    }
  }
}

// ============================================================================
// ExtensionUI implementation
// ============================================================================

/** Throttle window for coalescing render notifications (ms). */
const RENDER_THROTTLE_MS = 100;

/** Throttle window for coalescing pushed context snapshots (ms). */
const CONTEXT_THROTTLE_MS = 250;

/**
 * {@link ExtensionUI} implementation. The unified bus is the single mechanism
 * (no internal pub/sub registry), so every state change is a `notify` call the
 * session `extension-ui` channel projection can consume.
 *
 * Render slots are retained so a host subscribing late can reconcile, and are
 * attributed to an owner so disabling an extension clears its slots.
 */
class DefaultExtensionUI implements ExtensionUI {
  /** surface → key → payload (retained for late-subscriber reconciliation). */
  private readonly slots = new Map<string, Map<string, ExtensionRenderPayload>>();
  /** slot id → owning extension id, for owner-scoped teardown. */
  private readonly slotOwners = new Map<string, string>();
  /** Coalesced, not-yet-notified slot updates. */
  private readonly pending = new Map<
    string,
    { surface: string; key: string; payload: ExtensionRenderPayload | null }
  >();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private lastFlushAt = 0;

  constructor(
    private readonly bus: AgentEventBus | null,
    private readonly buildContext: () => ExtensionUiContext
  ) {}

  /**
   * Publish an `extension:ui` observer event on the agent's scoped bus (the
   * session `extension-ui` channel projection consumes it). The internal
   * pub/sub registry is gone — the bus is the single mechanism.
   */
  emitEvent(type: string, data: Record<string, unknown>): void {
    this.bus?.emit("extension:ui", { type, ...data } as never);
  }

  /**
   * Host-native, auto-clearing notification (the CLI renders it in its input
   * feedback line). Persistent content belongs in a {@link render} slot.
   */
  notify(message: string, level: ExtensionNotificationLevel = "info"): void {
    this.emitEvent("notify", { message, level });
  }

  /**
   * Subscribe to one `extension:ui` notification type via the bus (facade over
   * `extension:ui` events; kept so `ctx.ui.subscribe` keeps its shape).
   */
  subscribe<T = unknown>(type: string, handler: (data: T) => void): () => void {
    if (!this.bus) return () => {};
    return this.bus.on("extension:ui", (event) => {
      if (event.payload.type === type) handler(event.payload as unknown as T);
    });
  }

  /**
   * Write a render payload into a surface slot. `ownerId` is supplied by
   * {@link ExtensionRunner.wrapUi} so a disabled extension's slots can be
   * cleared later. Empty/whitespace raw strings, non-renderable payloads, and
   * payloads that are not JSON-serializable are all normalized to `null` (remove
   * the slot).
   */
  render(surface: string, key: string, payload: ExtensionRenderPayload | null, ownerId?: string): void {
    try {
      const next = normalizePayload(payload);
      const id = slotId(surface, key);
      // Identical payload: nothing to render, so do not notify the host at all.
      if (fingerprintOf(this.slots.get(surface)?.get(key) ?? null) === next.fingerprint) return;
      this.writeSlot(surface, key, next.value);
      if (ownerId !== undefined) {
        // Only existing slots are owned; a removed slot drops its owner entry so
        // the ownership map cannot grow without bound.
        if (next.value === null) this.slotOwners.delete(id);
        else this.slotOwners.set(id, ownerId);
      }
      this.queueNotify(surface, key, next.value);
    } catch {
      // Failure contained: a broken publish must not break the host UI or the
      // agent loop.
    }
  }

  /** Retained slots (surface → key → payload); lets a late host reconcile. */
  getSlots(): Readonly<Record<string, Record<string, ExtensionRenderPayload>>> {
    const out: Record<string, Record<string, ExtensionRenderPayload>> = {};
    for (const [surface, slots] of this.slots) out[surface] = Object.fromEntries(slots);
    return out;
  }

  getContext(): ExtensionUiContext {
    return this.buildContext();
  }

  /**
   * Remove every slot owned by `ownerId` and notify the host, so a disabled
   * extension's UI does not linger.
   */
  clearSlotsByOwner(ownerId: string): void {
    for (const [id, owner] of Array.from(this.slotOwners)) {
      if (owner !== ownerId) continue;
      this.slotOwners.delete(id);
      const [surface, key] = id.split("\u0000");
      if (surface === undefined || key === undefined) continue;
      this.writeSlot(surface, key, null);
      this.queueNotify(surface, key, null);
    }
  }

  /** Remove all slots and notify the host. */
  clearAllSlots(): void {
    for (const [surface, slots] of this.slots) {
      for (const key of slots.keys()) this.queueNotify(surface, key, null);
    }
    this.slots.clear();
    this.slotOwners.clear();
    this.flush();
  }

  /** Flush coalesced notifications immediately (used on teardown). */
  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.pending.size === 0) return;
    const updates = Array.from(this.pending.values());
    this.pending.clear();
    this.lastFlushAt = Date.now();
    for (const update of updates) {
      this.emitEvent("render", { surface: update.surface, key: update.key, payload: update.payload });
    }
  }

  private writeSlot(surface: string, key: string, payload: ExtensionRenderPayload | null): void {
    if (payload === null) {
      const existing = this.slots.get(surface);
      if (!existing) return;
      existing.delete(key);
      if (existing.size === 0) this.slots.delete(surface);
      return;
    }
    let slots = this.slots.get(surface);
    if (!slots) {
      slots = new Map();
      this.slots.set(surface, slots);
    }
    slots.set(key, payload);
  }

  /**
   * Coalesce slot updates and notify at most once per {@link RENDER_THROTTLE_MS}
   * window (leading edge): rapid publishes collapse to the latest payload per
   * slot instead of re-rendering the host on every write.
   */
  private queueNotify(surface: string, key: string, payload: ExtensionRenderPayload | null): void {
    this.pending.set(slotId(surface, key), { surface, key, payload });
    const elapsed = Date.now() - this.lastFlushAt;
    if (elapsed >= RENDER_THROTTLE_MS) {
      this.flush();
      return;
    }
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, RENDER_THROTTLE_MS - elapsed);
    // Never keep a host process alive just to flush extension UI.
    (this.flushTimer as { unref?: () => void }).unref?.();
  }
}

// ============================================================================
// ExtensionRunner
// ============================================================================

export interface ExtensionRunnerOptions {
  getEnvVar: (key: string) => string | undefined;
  onRegisterTool?: (def: ExtensionToolDefinition) => void;
  onRegisterCommand?: (cmd: ExtensionCommand) => void;
  /** Unregister a previously registered tool (used when disabling an extension). */
  onUnregisterTool?: (name: string) => void;
  /** Unregister a previously registered command (used when disabling an extension). */
  onUnregisterCommand?: (name: string) => void;
  /** Working directory (rootPath) injected into {@link ExtensionContext.cwd}. */
  cwd?: string;
  /**
   * Resolve the runtime CoreEnv to inject into {@link ExtensionContext.coreEnv}.
   * Defaults to the globally registered CoreEnv (`getEnv()`).
   */
  getCoreEnv?: () => CoreEnv;
  /**
   * Scoped unified event bus backing extension interception and telemetry.
   * Extension lifecycle failures (activate / deactivate) are emitted as
   * `agent:extension-error` on it, surfacing in AgentLog / lifecycle channels
   * via the Event→Log bridge instead of being swallowed. Defaults to a
   * standalone bus for hosts that build an {@link ExtensionRunner} without an agent.
   */
  eventBus?: AgentEventBus;
  /**
   * Optional agent log to converge extension logging into. When provided,
   * `ctx.logger` and turn-context provider failures are written as structured
   * `hooks` entries instead of raw console output (console stays as a fallback
   * for standalone runner usage without an agent log).
   */
  log?: AgentLog | null;
  /**
   * Host-supplied overrides for the extension UI context snapshot (model /
   * status / usage / workspace / session name / mode). Omitted fields fall back
   * to retained bus state and the runner's own `cwd`.
   */
  getUiContext?: () => Partial<ExtensionUiContext>;
}

export class ExtensionRunner {
  private extensions: ExtensionInstance[] = [];
  private toolRegistry = new Map<string, ExtensionToolDefinition>();
  private commandRegistry = new Map<string, ExtensionCommand>();
  /** name → owning extension id, to unregister only the owner's artifact on disable. */
  private toolOwners = new Map<string, string>();
  private commandOwners = new Map<string, string>();
  /** Per-extension context injection (extension id → provider). */
  private contextProviders = new Map<string, ExtensionContextProvider>();
  /**
   * Persistent "this extension is disabled" notices keyed by extension id
   * (captured from a provider's `disabledContent` at disable time, since destroy
   * unsubscribes the provider). Cleared when the extension is re-enabled.
   */
  private disabledExtensionNotices = new Map<string, string>();
  private eventBus: BusExtensionEventBus;
  /** Raw scoped bus (interception + telemetry) behind the extension-facing facade. */
  private readonly rawBus: AgentEventBus;
  private ui: DefaultExtensionUI;
  private options: ExtensionRunnerOptions;
  /** Teardown callbacks for context-push subscriptions. */
  private readonly contextUnsubs: Array<() => void> = [];
  private contextTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: ExtensionRunnerOptions) {
    this.options = options;
    const bus = options.eventBus ?? createAgentEventBus();
    this.rawBus = bus;
    this.eventBus = new BusExtensionEventBus(bus);
    this.ui = new DefaultExtensionUI(bus, () => this.buildUiContext());
    // Push a fresh context snapshot (throttled) whenever state extensions render
    // from changes, so they never have to poll `getContext()`.
    for (const type of ["agent:state", "session:usage", "session:mode"] as const) {
      this.contextUnsubs.push(bus.on(type, () => this.scheduleContextPush(), { replay: false }));
    }
  }

  getEventBus(): ExtensionEventBus {
    return this.eventBus;
  }

  getUI(): ExtensionUI {
    return this.ui;
  }

  /**
   * Retained extension render slots (surface → key → payload). Lets a session
   * replay slots that were rendered before a host subscribed.
   */
  getUISlots(): Readonly<Record<string, Record<string, ExtensionRenderPayload>>> {
    return this.ui.getSlots();
  }

  /**
   * Assemble the context snapshot from retained bus state, overlaid with any
   * host-supplied overrides. Unknown values degrade to `null` / empty rather
   * than throwing — a snapshot is always returned.
   */
  private buildUiContext(): ExtensionUiContext {
    const override = this.options.getUiContext?.();
    const state = this.rawBus.retainedValue("agent:state");
    const usage = this.rawBus.retainedValue("session:usage");
    const mode = this.rawBus.retainedValue("session:mode");

    const modelId = override?.model?.id ?? state?.model ?? "";
    const displayName = override?.model?.displayName ?? state?.modelInfo?.name ?? modelId;

    return {
      model: override?.model ?? (modelId ? { id: modelId, displayName } : null),
      status: override?.status ?? state?.status ?? "unknown",
      usage:
        override?.usage ??
        (usage
          ? {
              percent: usage.percent,
              tokenLimit: usage.tokenLimit,
              windowTokens: usage.window.totalTokens,
              costUsd: usage.cost,
            }
          : null),
      workspace: override?.workspace ?? { root: this.options.cwd ?? "", branch: null },
      sessionName: override?.sessionName ?? null,
      mode: override?.mode ?? mode?.mode ?? null,
    };
  }

  /** Coalesced `context` push so subscribers see changes without polling. */
  private scheduleContextPush(): void {
    if (this.contextTimer) return;
    this.contextTimer = setTimeout(() => {
      this.contextTimer = null;
      try {
        this.ui.emitEvent("context", { context: this.ui.getContext() });
      } catch {
        // Failure contained: context pushes are best-effort.
      }
    }, CONTEXT_THROTTLE_MS);
    (this.contextTimer as { unref?: () => void }).unref?.();
  }

  /**
   * Wrap the shared UI for a single extension so render slots are attributed to
   * that extension (used to clear its slots when it is disabled). Every other
   * member (notify / subscribe / getContext) is shared.
   */
  private wrapUi(ownerId: string): ExtensionUI {
    return {
      notify: (message, level) => this.ui.notify(message, level),
      subscribe: (type, handler) => this.ui.subscribe(type, handler),
      render: (surface, key, payload) => this.ui.render(surface, key, payload, ownerId),
      getContext: () => this.ui.getContext(),
    };
  }

  /**
   * Emit `session:start` to registered interceptors (per-agent ExtensionEventBus).
   * Distinct from the telemetry `session:start` emitted via the unified bus —
   * this one is interceptable by extensions.
   */
  emitSessionStart(cwd: string, sessionId: string): void {
    // Fire-and-forget interception: interceptor errors must not surface as
    // unhandled rejections or break session bootstrap.
    this.eventBus
      .emit({
        type: "session:start",
        payload: { cwd, sessionId },
        defaultReturn: undefined,
      })
      .catch(() => {});
  }

  /**
   * Emit `session:shutdown` to registered interceptors before teardown.
   */
  emitSessionShutdown(sessionId: string): void {
    // Fire-and-forget interception: interceptor errors must not surface as
    // unhandled rejections or break teardown.
    this.eventBus
      .emit({
        type: "session:shutdown",
        payload: { sessionId },
        defaultReturn: undefined,
      })
      .catch(() => {});
  }

  getTools(): ExtensionToolDefinition[] {
    return Array.from(this.toolRegistry.values());
  }

  getCommands(): ExtensionCommand[] {
    return Array.from(this.commandRegistry.values());
  }

  getTool(name: string): ExtensionToolDefinition | undefined {
    return this.toolRegistry.get(name);
  }

  /**
   * Emit `before_agent_start` to each interceptor (observable event), then run
   * registered context providers. Returns per-extension turn-context sections.
   */
  async collectBeforeAgentStart(prompt: string, sessionId: string): Promise<ExtensionPromptAppends> {
    // Dispatch through intercept (shared mutable event, ordered, awaited);
    // handlers that append turn context do so on the event without cancelling.
    const event: BeforeAgentStartEvent = {
      type: "before_agent_start",
      payload: { prompt, sessionId },
      defaultReturn: undefined,
    };
    await this.eventBus.emit(event);

    // Each enabled extension with content becomes its own section (kind = id).
    const turnContextSections: ExtensionTurnContextSection[] = [];
    for (const [id, provider] of this.contextProviders) {
      try {
        const value = await provider.content?.();
        if (value?.trim()) turnContextSections.push({ id, content: value.trim() });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Converge into the agent log via the existing `agent:extension-error`
        // rule (error/system) rather than a bare console write; console stays
        // as a fallback for standalone runners without an injected bus.
        if (this.options.eventBus) {
          this.rawBus.emit("agent:extension-error", {
            extensionId: id,
            phase: "turn-context",
            error: message,
          });
        } else {
          this.writeExtensionLog("error", id, `turn context provider failed: ${message}`);
        }
      }
    }
    // Surface runtime-disabled extensions under the same tag so the model knows
    // their tools are gone (symmetric to the enable-side section). A disabled
    // extension's providers were already unsubscribed on destroy, so its id never
    // also appears above.
    for (const [id, notice] of this.disabledExtensionNotices) {
      if (notice?.trim()) turnContextSections.push({ id, content: notice.trim() });
    }

    return { turnContextSections };
  }

  async loadExtension(api: ExtensionAPI, config?: ExtensionConfig): Promise<ExtensionInstance> {
    const registrations: ExtensionRegistrations = {
      tools: [],
      commands: [],
      unsubInterceptors: [],
      unsubTurnContext: [],
    };
    const ctx = this.createContext(api, config, registrations);

    const instance: ExtensionInstance = {
      api,
      context: ctx,
      state: "inactive",
      registrations,
    };

    this.extensions.push(instance);

    try {
      await api.activate(ctx);
      instance.state = "active";
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      // Roll back any artifacts registered before the failure so a later re-enable
      // starts clean (no duplicate registrations).
      this.unregisterInstanceArtifacts(instance);
      instance.state = "error";
      instance.error = error;
      ctx.logger.error(`Failed to activate extension "${api.id}": ${error.message}`);
      this.rawBus.emit("agent:extension-error", {
        extensionId: api.id,
        phase: "activate",
        error: error.message,
      });
    }

    return instance;
  }

  async destroyExtension(instance: ExtensionInstance): Promise<void> {
    if (instance.api.deactivate) {
      try {
        await instance.api.deactivate();
      } catch (err) {
        // Do not swallow: surface deactivation failures for observability.
        const error = err instanceof Error ? err : new Error(String(err));
        this.rawBus.emit("agent:extension-error", {
          extensionId: instance.api.id,
          phase: "deactivate",
          error: error.message,
        });
      }
    }
    this.unregisterInstanceArtifacts(instance);
    // Clear any surface slots this extension rendered so they do not linger
    // after the extension is disabled (e.g. `LSP: 3 error(s) in src/app.ts`).
    this.ui.clearSlotsByOwner(instance.api.id);
    instance.state = "inactive";
  }

  async destroyAll(): Promise<void> {
    for (const instance of this.extensions) {
      await this.destroyExtension(instance);
    }
    this.extensions = [];
    this.toolRegistry.clear();
    this.commandRegistry.clear();
    this.toolOwners.clear();
    this.commandOwners.clear();
    this.contextProviders.clear();
    this.disabledExtensionNotices.clear();
    this.ui.clearAllSlots();
    if (this.contextTimer) {
      clearTimeout(this.contextTimer);
      this.contextTimer = null;
    }
    for (const unsub of this.contextUnsubs) unsub();
    this.contextUnsubs.length = 0;
  }

  /** Read-only snapshot of loaded extensions for management commands. */
  getExtensionInfos(): ExtensionInfo[] {
    return this.extensions.map((instance) => ({
      id: instance.api.id,
      name: instance.api.name,
      version: instance.api.version,
      description: instance.api.description,
      enabled: instance.state === "active",
      state: instance.state,
      error: instance.error?.message,
      tools: [...instance.registrations.tools],
      // Expose whether each command has a secondary menu (getOptions) so the app
      // can treat pure-display commands (e.g. /lsp, /mcp) without an options menu.
      commands: instance.registrations.commands.map((name) => ({
        name,
        hasOptions: Boolean(this.commandRegistry.get(name)?.getOptions),
      })),
    }));
  }

  /**
   * Enable or disable an extension at runtime. Disabling deactivates it and unregisters
   * its tools/commands/interceptors/turn-context providers; enabling re-activates it.
   * Returns a result describing what happened.
   */
  async setEnabled(id: string, enabled: boolean): Promise<{ ok: boolean; message: string }> {
    const instance = this.extensions.find((e) => e.api.id === id);
    if (!instance) return { ok: false, message: `Extension "${id}" not loaded` };

    const already = instance.state === "active";
    if (enabled && already) return { ok: true, message: `Extension "${id}" already enabled` };
    if (!enabled && !already) return { ok: true, message: `Extension "${id}" already disabled` };

    if (enabled) {
      try {
        await instance.api.activate(instance.context);
        instance.state = "active";
        instance.error = undefined;
        this.disabledExtensionNotices.delete(instance.api.id);
        return { ok: true, message: `Extension "${id}" enabled` };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        // Roll back any artifacts registered before the failure.
        this.unregisterInstanceArtifacts(instance);
        instance.state = "error";
        instance.error = error;
        return { ok: false, message: `Failed to enable "${id}": ${error.message}` };
      }
    }

    // Capture the provider's disabledContent BEFORE destroy (destroy unsubscribes
    // it). Undefined/absent falls back to a generic notice so non-customizing
    // extensions stay informative; an empty string explicitly opts out.
    const provider = this.contextProviders.get(instance.api.id);
    const custom =
      provider?.disabledContent === undefined ? undefined : ((await provider.disabledContent()) ?? undefined);

    await this.destroyExtension(instance);
    const notice =
      custom === undefined
        ? `Extension "${instance.api.name ?? id}" is disabled — its tools and commands are unavailable.`
        : custom.trim();
    if (notice) this.disabledExtensionNotices.set(instance.api.id, notice);
    else this.disabledExtensionNotices.delete(instance.api.id);
    return { ok: true, message: `Extension "${id}" disabled` };
  }

  /**
   * Unregister all artifacts an extension registered during activate().
   * Tools/commands are removed from the registry and the host; interceptors and
   * turn-context providers are unsubscribed.
   */
  private unregisterInstanceArtifacts(instance: ExtensionInstance): void {
    for (const name of instance.registrations.tools) {
      // Only unregister when this extension still owns the artifact — a later extension
      // may have overwritten the same name, and we must not remove its registration.
      if (this.toolOwners.get(name) !== instance.api.id) continue;
      this.toolOwners.delete(name);
      this.toolRegistry.delete(name);
      this.options.onUnregisterTool?.(name);
    }
    for (const name of instance.registrations.commands) {
      if (this.commandOwners.get(name) !== instance.api.id) continue;
      this.commandOwners.delete(name);
      this.commandRegistry.delete(name);
      this.options.onUnregisterCommand?.(name);
    }
    for (const unsub of instance.registrations.unsubInterceptors) {
      unsub();
    }
    for (const unsub of instance.registrations.unsubTurnContext) {
      unsub();
    }
    // Clear in place (`.length = 0`) rather than reassigning: the `createContext`
    // closures reference `registrations` and may read/capture these arrays at call
    // time. Reassigning would silently desync re-enabled registrations from the
    // instance, leaking them on a later disable.
    instance.registrations.tools.length = 0;
    instance.registrations.commands.length = 0;
    instance.registrations.unsubInterceptors.length = 0;
    instance.registrations.unsubTurnContext.length = 0;
  }

  private createContext(
    api: ExtensionAPI,
    config?: ExtensionConfig,
    registrations?: ExtensionRegistrations
  ): ExtensionContext {
    return {
      id: api.id,
      env: this.resolveEnv(api.id, config?.config),
      z,
      cwd: this.options.cwd ?? "",
      coreEnv: this.resolveCoreEnv(),
      registerTool: (def: ExtensionToolDefinition) => {
        this.toolRegistry.set(def.name, def);
        this.toolOwners.set(def.name, api.id);
        registrations?.tools.push(def.name);
        this.options.onRegisterTool?.(def);
      },

      registerCommand: (cmd: ExtensionCommand) => {
        this.commandRegistry.set(cmd.name, cmd);
        this.commandOwners.set(cmd.name, api.id);
        registrations?.commands.push(cmd.name);
        this.options.onRegisterCommand?.(cmd);
      },

      registerInterceptor: <T extends InterceptableEvent>(
        eventType: string,
        handler: EventInterceptor<T>
      ): (() => void) => {
        const unsub = this.eventBus.on(eventType, handler);
        registrations?.unsubInterceptors.push(unsub);
        return unsub;
      },

      registerContextProvider: (provider: ExtensionContextProvider): (() => void) => {
        this.contextProviders.set(api.id, provider);
        const unsub = () => {
          if (this.contextProviders.get(api.id) === provider) this.contextProviders.delete(api.id);
        };
        registrations?.unsubTurnContext.push(unsub);
        return unsub;
      },

      events: this.eventBus,
      ui: this.wrapUi(api.id),

      logger: {
        info: (msg: string) => this.writeExtensionLog("info", api.id, msg),
        warn: (msg: string) => this.writeExtensionLog("warn", api.id, msg),
        error: (msg: string) => this.writeExtensionLog("error", api.id, msg),
      },
    };
  }

  /**
   * Converge extension logging into the agent log (`hooks` category) when one
   * is wired; fall back to console for standalone runner usage (validation
   * scripts, hosts that build an ExtensionRunner without an agent).
   */
  private writeExtensionLog(level: "info" | "warn" | "error", extensionId: string, msg: string): void {
    const message = `[extension:${extensionId}] ${msg}`;
    const log = this.options.log;
    if (log) {
      if (level === "error") log.error("hooks", message);
      else if (level === "warn") log.warn("hooks", message);
      else log.info("hooks", message);
      return;
    }
    if (level === "error") console.error(message);
    else if (level === "warn") console.warn(message);
    else console.log(message);
  }

  private resolveCoreEnv(): CoreEnv {
    // Prefer the explicitly injected provider; else the globally registered CoreEnv if present;
    // else a minimal non-throwing stub so extension construction never fails in hosts that
    // build an ExtensionRunner standalone (e.g. validation scripts).
    if (this.options.getCoreEnv) return this.options.getCoreEnv();
    if (hasCoreEnv()) return getEnv();
    return {
      rootPath: this.options.cwd ?? "",
      getPlatform: async () => "unknown",
      getArch: async () => "unknown",
      getEnv: async () => ({}),
      homedir: async () => "",
      fs: {
        readFile: async () => {
          throw new Error("CoreEnv not registered");
        },
        stat: async () => {
          throw new Error("CoreEnv not registered");
        },
        readdir: async () => {
          throw new Error("CoreEnv not registered");
        },
        writeFile: async () => {
          throw new Error("CoreEnv not registered");
        },
        mkdir: async () => {
          throw new Error("CoreEnv not registered");
        },
        exists: async () => {
          throw new Error("CoreEnv not registered");
        },
        remove: async () => {
          throw new Error("CoreEnv not registered");
        },
      },
      runCommand: async () => {
        throw new Error("CoreEnv not registered");
      },
      exec: async () => {
        throw new Error("CoreEnv not registered");
      },
      fetch: async () => {
        throw new Error("CoreEnv not registered");
      },
    };
  }

  private resolveEnv(apiId: string, extConfig?: Record<string, unknown>): Record<string, string> {
    const env: Record<string, string> = {};

    if (extConfig) {
      for (const [key, value] of Object.entries(extConfig)) {
        if (typeof value === "string") {
          env[key] = value;
        }
      }
    }

    const apiKey = this.options.getEnvVar(`${apiId.toUpperCase()}_API_KEY`);
    if (apiKey) {
      env["API_KEY"] = apiKey;
    }

    return env;
  }
}
