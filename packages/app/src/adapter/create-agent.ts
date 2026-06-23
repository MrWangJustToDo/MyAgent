/**
 * Shared agent initialization logic extracted from LocalAgentAdapter and ExtensionAgentAdapter.
 * Both adapters delegate to this helper to avoid duplicating ~80 lines of identical setup code.
 */

import {
  agentManager,
  buildDefaultSystemPrompt,
  createDeepSeekModel,
  createModelFromId,
  createOllamaModel,
  createOpenAICompatibleModel,
  createOpenRouterModel,
  getOllamaBuildInTools,
} from "@my-agent/core";
import { reactive, toRaw } from "reactivity-store";

import type { AppConfig, InitResult } from "./types.js";
import type { useAgentContext as useAgentContextType } from "../hooks/use-agent-context.js";
import type { useAgentLog as useAgentLogType } from "../hooks/use-agent-log.js";
import type { useAgent as useAgentType } from "../hooks/use-agent.js";
import type { useTodoManager as useTodoManagerType } from "../hooks/use-todo-manager.js";
import type { Agent, AgentContext, LanguageModel, ModelInfo } from "@my-agent/core";
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
 */
export async function createAgentFromConfig({ config, name, hooks }: CreateAgentOptions): Promise<InitResult> {
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
