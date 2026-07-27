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
} from "./types.js";

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
}

// ============================================================================
// ExtensionRunner
// ============================================================================

export interface ExtensionRunnerOptions {
  getEnvVar: (key: string) => string | undefined;
  onRegisterTool?: (def: ExtensionToolDefinition) => void;
  onRegisterCommand?: (cmd: ExtensionCommand) => void;
}

export class ExtensionRunner {
  private extensions: ExtensionInstance[] = [];
  private toolRegistry = new Map<string, ExtensionToolDefinition>();
  private commandRegistry = new Map<string, ExtensionCommand>();
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
    const ctx = this.createContext(api, config);

    const instance: ExtensionInstance = {
      api,
      context: ctx,
      state: "inactive",
    };

    this.extensions.push(instance);

    try {
      await api.activate(ctx);
      instance.state = "active";
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
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
    instance.state = "inactive";
  }

  async destroyAll(): Promise<void> {
    for (const instance of this.extensions) {
      await this.destroyExtension(instance);
    }
    this.extensions = [];
    this.toolRegistry.clear();
    this.commandRegistry.clear();
    this.turnContextProviders.clear();
  }

  private createContext(api: ExtensionAPI, config?: ExtensionConfig): ExtensionContext {
    return {
      id: api.id,
      env: this.resolveEnv(api.id, config?.config),
      z,

      registerTool: (def: ExtensionToolDefinition) => {
        this.toolRegistry.set(def.name, def);
        this.options.onRegisterTool?.(def);
      },

      registerCommand: (cmd: ExtensionCommand) => {
        this.commandRegistry.set(cmd.name, cmd);
        this.options.onRegisterCommand?.(cmd);
      },

      registerInterceptor: <T extends InterceptableEvent>(
        eventType: string,
        handler: EventInterceptor<T>
      ): (() => void) => {
        return this.eventBus.on(eventType, handler);
      },

      registerTurnContextProvider: (fn: TurnContextProvider): (() => void) => {
        this.turnContextProviders.add(fn);
        return () => {
          this.turnContextProviders.delete(fn);
        };
      },

      events: this.eventBus,
      ui: this.ui,

      logger: {
        info: (msg: string) => console.log(`[extension:${api.id}] ${msg}`),
        warn: (msg: string) => console.warn(`[extension:${api.id}] ${msg}`),
        error: (msg: string) => console.error(`[extension:${api.id}] ${msg}`),
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
