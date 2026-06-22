import {
  agentManager,
  buildDefaultSystemPrompt,
  createDeepSeekModel,
  createModelFromId,
  createOllamaModel,
  createOpenAICompatibleModel,
  createOpenRouterModel,
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
  useAgentContext as useAgentContextType,
  useAgentLog as useAgentLogType,
  useTodoManager as useTodoManagerType,
} from "@my-agent/app";
import type { Agent, AgentContext, LanguageModel, ModelInfo } from "@my-agent/core";
import type { ChatTransport, ToolSet, UIMessage } from "ai";

export class ExtensionAgentAdapter implements AgentAdapter {
  private agent: Agent | null = null;
  private _hookSetters: {
    useAgent: typeof useAgentType;
    useAgentLog: typeof useAgentLogType;
    useAgentContext: typeof useAgentContextType;
    useTodoManager: typeof useTodoManagerType;
  };

  constructor(options: {
    hooks: {
      useAgent: typeof useAgentType;
      useAgentLog: typeof useAgentLogType;
      useAgentContext: typeof useAgentContextType;
      useTodoManager: typeof useTodoManagerType;
    };
  }) {
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
      name: "extension-chat",
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
    this.destroy().then(() => {
      // chrome.sidePanel API can't programmatically close; fall back to window.close()
      // which works in popups but is best-effort for sidepanels
      try {
        window.close();
      } catch {
        // If close fails, reload to reset the panel state
        window.location.reload();
      }
    });
  }

  async readClipboardImage(): Promise<ClipboardImageResult | null> {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (!imageType) continue;
        const blob = await item.getType(imageType);
        const buffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const data = btoa(binary);
        return { data, mediaType: imageType };
      }
      return null;
    } catch {
      return null;
    }
  }
}
