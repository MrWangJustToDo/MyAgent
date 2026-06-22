import {
  agentManager,
  buildDefaultSystemPrompt,
  createDeepSeekModel,
  createModelFromId,
  createOllamaModel,
  createOpenRouterModel,
  createOpenAICompatibleModel,
  DirectChatTransport,
  getOllamaBuildInTools,
} from "@my-agent/core";
import { reactive, toRaw } from "reactivity-store";

import type {
  AgentAdapter,
  AppConfig,
  ClipboardImageResult,
  InitResult,
  useAgent as useAgentType,
  useAgentLog as useAgentLogType,
  useAgentContext as useAgentContextType,
  useTodoManager as useTodoManagerType,
} from "@my-agent/app";
import type { Agent, AgentContext, LanguageModel, ModelInfo } from "@my-agent/core";
import type { ChatTransport, ToolSet, UIMessage } from "ai";

export class LocalAgentAdapter implements AgentAdapter {
  private agent: Agent | null = null;
  private _exit: () => void;
  private _readClipboardImage: (() => Promise<ClipboardImageResult | null>) | null;
  private _hookSetters: {
    useAgent: typeof useAgentType;
    useAgentLog: typeof useAgentLogType;
    useAgentContext: typeof useAgentContextType;
    useTodoManager: typeof useTodoManagerType;
  };

  constructor(options: {
    exit: () => void;
    readClipboardImage?: () => Promise<ClipboardImageResult | null>;
    hooks: {
      useAgent: typeof useAgentType;
      useAgentLog: typeof useAgentLogType;
      useAgentContext: typeof useAgentContextType;
      useTodoManager: typeof useTodoManagerType;
    };
  }) {
    this._exit = options.exit;
    this._readClipboardImage = options.readClipboardImage ?? null;
    this._hookSetters = options.hooks;
  }

  createTransport(): ChatTransport<UIMessage> {
    if (!this.agent) throw new Error("Agent not initialized");
    return new DirectChatTransport({ agent: this.agent }) as ChatTransport<UIMessage>;
  }

  async initialize(config: AppConfig): Promise<InitResult> {
    let languageModel: LanguageModel | null = null;
    let modelInfo: ModelInfo | undefined;
    let extendTools: ToolSet = {};

    try {
      const result = await createModelFromId(config.model, { apiKey: config.apiKey, baseURL: config.url });
      languageModel = result.model;
      modelInfo = result.info;
    } catch {
      if (config.provider === "ollama") {
        languageModel = createOllamaModel(config.model, config.url, { reasoning: true });
      } else if (config.provider === "openaiCompatible") {
        languageModel = createOpenAICompatibleModel(config.model, config.url);
      } else if (config.provider === "deepseek") {
        languageModel = await createDeepSeekModel(config.model, config.apiKey);
      } else {
        languageModel = await createOpenRouterModel(config.model, config.apiKey);
      }
    }

    if (config.provider === "ollama") {
      extendTools = getOllamaBuildInTools((p) => ({
        ["ollama-web-fetch"]: p.tools.webFetch(),
        ["ollama-web-search"]: p.tools.webSearch(),
      }));
    }

    const agent = await agentManager.createManagedAgent({
      languageModel: languageModel!,
      modelInfo,
      model: config.model,
      name: "local-chat",
      systemPrompt: config.systemPrompt || (await buildDefaultSystemPrompt()),
      maxIterations: config.maxIterations,
      mcpConfigPath: config.mcpConfigPath || undefined,
      setUp: (instance: (Agent | AgentContext) & { ["$$symbol"]?: symbol }) => {
        if (instance["$$symbol"]) return instance;
        instance["$$symbol"] = Symbol.for("patch");
        const pInstance = reactive(instance);
        return new Proxy(pInstance, {
          get(target, p, receiver) {
            const key = p.toString()?.toLowerCase?.() || "";
            if (key.includes("tool") || key.includes("config")) {
              return toRaw(Reflect.get(target, p, receiver));
            }
            return Reflect.get(target, p, receiver);
          },
        }) as Agent | AgentContext;
      },
    });

    agent.addTools(extendTools);

    const { useAgent, useAgentLog, useAgentContext, useTodoManager } = this._hookSetters;

    const todoManager = agent.getTodoManager();
    if (todoManager) {
      todoManager.onChange(() => {
        useTodoManager.getActions().refresh();
      });
    }

    useAgent.getActions().setAgent(agent);
    useAgentLog.getActions().setLog(toRaw(agent.getLog()));
    useAgentContext.getActions().setContext(toRaw(agent.getContext()));
    useTodoManager.getActions().setManager(toRaw(todoManager ?? null));

    this.agent = agent;

    let initialMessages: UIMessage[] | undefined;
    if (config.continueSession || config.resumeSession) {
      const result = config.continueSession
        ? await agentManager.continueLatestSession(agent.id)
        : await agentManager.resumeSession(agent.id, config.resumeSession);
      if (result) {
        initialMessages = result.uiMessages;
      }
    }

    return { agent, initialMessages };
  }

  async destroy(): Promise<void> {
    if (this.agent) {
      agentManager.destroyAgent(this.agent.id);
      this.agent = null;
    }
  }

  exit(): void {
    this._exit();
  }

  async readClipboardImage(): Promise<ClipboardImageResult | null> {
    if (this._readClipboardImage) {
      return this._readClipboardImage();
    }
    return null;
  }
}
