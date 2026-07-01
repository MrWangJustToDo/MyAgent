/**
 * Shared agent initialization logic extracted from LocalAgentAdapter and ExtensionAgentAdapter.
 * Both adapters delegate to this helper to avoid duplicating ~80 lines of identical setup code.
 */

import {
  agentManager,
  buildDefaultSystemPrompt,
  createDeepSeekModel,
  createOllamaModel,
  createOpenAICompatibleModel,
  createOpenRouterModel,
  getOllamaBuildInTools,
  lookupModelFromModelsDev,
} from "@my-agent/core";
import { reactive, toRaw } from "reactivity-store";

import type { AppConfig, InitResult, Provider } from "./types.js";
import type { useAgentContext as useAgentContextType } from "../hooks/use-agent-context.js";
import type { useAgentLog as useAgentLogType } from "../hooks/use-agent-log.js";
import type { useAgent as useAgentType } from "../hooks/use-agent.js";
import type { useTodoManager as useTodoManagerType } from "../hooks/use-todo-manager.js";
import type { Agent, AgentContext, LanguageModel, ModelInfo, ModelProvider } from "@my-agent/core";
import type { ToolSet, UIMessage } from "ai";

export interface AdapterHooks {
  useAgent: typeof useAgentType;
  useAgentLog: typeof useAgentLogType;
  useAgentContext: typeof useAgentContextType;
  useTodoManager: typeof useTodoManagerType;
}

export interface CreateAgentOptions {
  config: AppConfig;
  name: string;
  hooks: AdapterHooks;
}

function patchInstance(instance: (Agent | AgentContext) & { ["$$symbol"]?: symbol }) {
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
}

/**
 * Create and configure a managed agent from app config.
 * Handles model creation, tool setup, hook wiring, and session restore.
 *
 * Design: provider/endpoint come entirely from user config (env/CLI).
 * models.dev is only consulted for model metadata (context window,
 * capabilities, pricing, reasoning config) — it never decides which SDK
 * factory or API endpoint is used.
 */
export async function createAgentFromConfig({ config, name, hooks }: CreateAgentOptions): Promise<InitResult> {
  let languageModel: LanguageModel | null = null;
  let modelInfo: ModelInfo | undefined;
  let extendTools: ToolSet = {};

  if (!config.model) {
    throw new Error(
      "No model configured. Set the MODEL environment variable (or use --model) to specify the model id."
    );
  }

  // 1. Create the LanguageModel from the user-configured provider.
  //    The provider and endpoint are fully controlled by the user; models.dev
  //    is NOT consulted here.
  if (config.provider === "ollama") {
    languageModel = createOllamaModel(config.model, config.url, { reasoning: true });
  } else if (config.provider === "openaiCompatible") {
    languageModel = createOpenAICompatibleModel(config.model, config.url, config.apiKey);
  } else if (config.provider === "deepseek") {
    languageModel = await createDeepSeekModel(config.model, config.apiKey);
  } else {
    languageModel = await createOpenRouterModel(config.model, config.apiKey);
  }

  // 2. Resolve model metadata. Priority:
  //    a. config.modelInfo (from MODEL_* env vars) — highest, user override
  //    b. models.dev lookup — supplies contextWindow, capabilities, pricing, etc.
  //    c. undefined — SDK defaults will be used for compaction/maxOutputTokens
  //
  //  models.dev only provides metadata; the `provider` field it returns does
  //  NOT reflect the user's actual provider/endpoint and is overwritten with
  //  the user-configured provider below.
  const providerToModelProvider: Record<Provider, ModelProvider> = {
    ollama: "ollama",
    openRouter: "open-router",
    openaiCompatible: "openai",
    deepseek: "deepseek",
  };
  if (config.modelInfo) {
    modelInfo = config.modelInfo;
  } else {
    try {
      const devInfo = await lookupModelFromModelsDev(config.model);
      if (devInfo) {
        // Overwrite the models.dev provider with the user's actual provider —
        // models.dev is metadata-only here, never the source of truth for routing.
        modelInfo = { ...devInfo, provider: providerToModelProvider[config.provider] };
      }
    } catch {
      // models.dev fetch failed (network error, no cache). Fall through with
      // undefined modelInfo; the agent will use SDK defaults.
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
    name,
    systemPrompt: config.systemPrompt || (await buildDefaultSystemPrompt()),
    maxIterations: config.maxIterations,
    mcpConfigPath: config.mcpConfigPath || undefined,
    setUp: patchInstance,
  });

  agent.addTools(extendTools);

  const { useAgent, useAgentLog, useAgentContext, useTodoManager } = hooks;

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

/**
 * Clear all hook stores (call in adapter.destroy()).
 */
export function clearAdapterHooks(hooks: AdapterHooks): void {
  hooks.useAgent.getActions().setAgent(null);
  hooks.useAgentLog.getActions().setLog(null);
  hooks.useAgentContext.getActions().setContext(null);
  hooks.useTodoManager.getActions().setManager(null);
}
