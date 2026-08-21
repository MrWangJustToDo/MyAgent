import { getEnv, hasCoreEnv } from "../../env.js";

import { z } from "./extension-zod.js";
import { joinExtensionAppendSegments } from "./join-append-segments.js";

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
  TurnContextProvider,
  ExtensionRegistrations,
  ExtensionInfo,
} from "./types.js";
import type { CoreEnv } from "../../env.js";

// ============================================================================
// ExtensionEventBus implementation
// ============================================================================

class DefaultExtensionEventBus implements ExtensionEventBus {
  private handlers = new Map<string, Set<EventInterceptor<InterceptableEvent>>>();

  async emit<T extends InterceptableEvent>(event: T): Promise<T["defaultReturn"] | undefined> {
    const handlers = this.handlers.get(event.type);
    if (!handlers || handlers.size === 0) return event.defaultReturn;

    for (const handler of handlers) {
      const result = await handler(event);
      if (result === false || event.skipDefault) {
        return undefined;
      }
    }

    return event.defaultReturn;
  }

  on<T extends InterceptableEvent>(type: string, handler: EventInterceptor<T>): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler as EventInterceptor<InterceptableEvent>);

    return () => {
      this.handlers.get(type)?.delete(handler as EventInterceptor<InterceptableEvent>);
    };
  }

  off<T extends InterceptableEvent>(type: string, handler: EventInterceptor<T>): void {
    this.handlers.get(type)?.delete(handler as EventInterceptor<InterceptableEvent>);
  }

  /** Handlers for a given event type in registration order. */
  getHandlers(type: string): EventInterceptor<InterceptableEvent>[] {
    const set = this.handlers.get(type);
    return set ? Array.from(set) : [];
  }
}

// ============================================================================
// ExtensionUI implementation
// ============================================================================

class DefaultExtensionUI implements ExtensionUI {
  private subscribers = new Map<string, Set<(data: unknown) => void>>();
  /** Retained status state so late subscribers can reconcile (e.g. after bootstrap). */
  private statusMap = new Map<string, string>();
  /** status key → owning extension id, so a disabled extension's status can be removed. */
  private statusOwners = new Map<string, string>();

  notify(type: string, data: unknown): void {
    const handlers = this.subscribers.get(type);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        handler(data);
      } catch {
        // Silently handle subscriber errors
      }
    }
  }

  subscribe<T = unknown>(type: string, handler: (data: T) => void): () => void {
    if (!this.subscribers.has(type)) {
      this.subscribers.set(type, new Set());
    }
    this.subscribers.get(type)!.add(handler as (data: unknown) => void);

    return () => {
      this.subscribers.get(type)?.delete(handler as (data: unknown) => void);
    };
  }

  setStatus(key: string, text: string): void {
    // Retain the latest value so hosts that subscribe after the update can read it.
    this.statusMap.set(key, text);
    // Publish a `set-status` notification the host UI renders in its status bar.
    this.notify("set-status", { key, text });
  }

  /**
   * Record which extension owns a status key, then set it. Used by the runner
   * wrapper so a disabled extension's status can be cleared on teardown.
   */
  setStatusWithOwner(key: string, text: string, ownerId: string): void {
    this.statusOwners.set(key, ownerId);
    this.setStatus(key, text);
  }

  /**
   * Remove every status key owned by `ownerId` and notify the host, so a
   * disabled extension's footer state does not linger.
   */
  clearStatusByOwner(ownerId: string): void {
    for (const [key, owner] of this.statusOwners) {
      if (owner !== ownerId) continue;
      this.statusOwners.delete(key);
      this.statusMap.delete(key);
      // Empty text signals the host to remove the status entry.
      this.notify("set-status", { key, text: "" });
    }
  }

  /** Remove all status entries and notify the host. */
  clearAllStatus(): void {
    for (const key of this.statusMap.keys()) {
      this.statusMap.delete(key);
      this.notify("set-status", { key, text: "" });
    }
    this.statusOwners.clear();
  }

  getStatus(): Readonly<Record<string, string>> {
    return Object.fromEntries(this.statusMap);
  }

  theme = {
    fg: (color: string, text: string): string => text,
  };
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
}

export class ExtensionRunner {
  private extensions: ExtensionInstance[] = [];
  private toolRegistry = new Map<string, ExtensionToolDefinition>();
  private commandRegistry = new Map<string, ExtensionCommand>();
  /** name → owning extension id, to unregister only the owner's artifact on disable. */
  private toolOwners = new Map<string, string>();
  private commandOwners = new Map<string, string>();
  private turnContextProviders = new Set<TurnContextProvider>();
  private eventBus: DefaultExtensionEventBus;
  private ui: DefaultExtensionUI;
  private options: ExtensionRunnerOptions;

  constructor(options: ExtensionRunnerOptions) {
    this.options = options;
    this.eventBus = new DefaultExtensionEventBus();
    this.ui = new DefaultExtensionUI();
  }

  getEventBus(): ExtensionEventBus {
    return this.eventBus;
  }

  getUI(): ExtensionUI {
    return this.ui;
  }

  /**
   * Wrap the shared UI for a single extension so status writes are attributed
   * to that extension (used to clear its footer state when it is disabled).
   * All other UI surface (notify / subscribe / getStatus / theme) is shared.
   */
  private wrapUi(ownerId: string): ExtensionUI {
    return {
      notify: (type, data) => this.ui.notify(type, data),
      subscribe: (type, handler) => this.ui.subscribe(type, handler),
      setStatus: (key, text) => this.ui.setStatusWithOwner(key, text, ownerId),
      getStatus: () => this.ui.getStatus(),
      theme: this.ui.theme,
    };
  }

  /**
   * Emit `session:start` to registered interceptors (per-agent ExtensionEventBus).
   * Distinct from the AgentTelemetryBus telemetry `session:start` — this one is
   * interceptable by extensions.
   */
  emitSessionStart(cwd: string, sessionId: string): void {
    void this.eventBus.emit({
      type: "session:start",
      payload: { cwd, sessionId },
      defaultReturn: undefined,
    });
  }

  /**
   * Emit `session:shutdown` to registered interceptors before teardown.
   */
  emitSessionShutdown(sessionId: string): void {
    void this.eventBus.emit({
      type: "session:shutdown",
      payload: { sessionId },
      defaultReturn: undefined,
    });
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
   * Emit `before_agent_start` to each interceptor with a fresh event, then run turn-context
   * providers. Returns concatenated append-only segments.
   */
  async collectBeforeAgentStart(prompt: string, sessionId: string): Promise<ExtensionPromptAppends> {
    const turnParts: string[] = [];
    const systemParts: string[] = [];

    const handlers = this.eventBus.getHandlers("before_agent_start");
    for (const handler of handlers) {
      const event: BeforeAgentStartEvent = {
        type: "before_agent_start",
        payload: { prompt, sessionId },
        defaultReturn: undefined,
      };
      await handler(event);
      if (event.appendTurnContext?.trim()) {
        turnParts.push(event.appendTurnContext.trim());
      }
      if (event.appendSystemPrompt?.trim()) {
        systemParts.push(event.appendSystemPrompt.trim());
      }
    }

    for (const provider of this.turnContextProviders) {
      try {
        const value = await provider();
        if (value?.trim()) {
          turnParts.push(value.trim());
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[extension] turn context provider failed: ${message}`);
      }
    }

    return {
      turnContext: joinExtensionAppendSegments(...turnParts),
      systemAppend: joinExtensionAppendSegments(...systemParts),
    };
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
    }

    return instance;
  }

  async destroyExtension(instance: ExtensionInstance): Promise<void> {
    if (instance.api.deactivate) {
      try {
        await instance.api.deactivate();
      } catch {
        // Swallow deactivation errors
      }
    }
    this.unregisterInstanceArtifacts(instance);
    // Clear any footer/status entries this extension wrote so they do not
    // linger after the extension is disabled (e.g. `LSP: typescript ready`).
    this.ui.clearStatusByOwner(instance.api.id);
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
    this.turnContextProviders.clear();
    this.ui.clearAllStatus();
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
      commands: [...instance.registrations.commands],
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

    await this.destroyExtension(instance);
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

      registerTurnContextProvider: (fn: TurnContextProvider): (() => void) => {
        this.turnContextProviders.add(fn);
        const unsub = () => {
          this.turnContextProviders.delete(fn);
        };
        registrations?.unsubTurnContext.push(unsub);
        return unsub;
      },

      events: this.eventBus,
      ui: this.wrapUi(api.id),

      logger: {
        info: (msg: string) => console.log(`[extension:${api.id}] ${msg}`),
        warn: (msg: string) => console.warn(`[extension:${api.id}] ${msg}`),
        error: (msg: string) => console.error(`[extension:${api.id}] ${msg}`),
      },
    };
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
