/**
 * Shared agent initialization logic extracted from LocalAgentAdapter and ExtensionAgentAdapter.
 * Both adapters delegate to this helper to avoid duplicating ~80 lines of identical setup code.
 */

import { agentManager, buildDefaultSystemPrompt, resolveModelConfig } from "@my-agent/core";
import { reactive, toRaw } from "reactivity-store";

import type { AppConfig, InitResult } from "./types.js";
import type { useAgentContext as useAgentContextType } from "../hooks/use-agent-context.js";
import type { useAgentLog as useAgentLogType } from "../hooks/use-agent-log.js";
import type { useAgent as useAgentType } from "../hooks/use-agent.js";
import type { useTodoManager as useTodoManagerType } from "../hooks/use-todo-manager.js";
import type { ManagedAgent } from "@my-agent/core";
import type { UIMessage } from "@tanstack/ai";

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

function patchInstance(instance: ManagedAgent & { ["$$symbol"]?: symbol }) {
  if (instance["$$symbol"]) return instance;
  instance["$$symbol"] = Symbol.for("patch");
  const pInstance = reactive(instance);
  return new Proxy(pInstance, {
    get(target, p, receiver) {
      const key = p.toString()?.toLowerCase?.() || "";
      if (key === "status" || key === "log") {
        return Reflect.get(target, p, receiver);
      }
      return toRaw(Reflect.get(target, p, receiver));
    },
  }) as ManagedAgent;
}

/**
 * Create and configure a managed agent from app config.
 * Handles tool setup, hook wiring, and session restore.
 */
export async function createAgentFromConfig({ config, name, hooks }: CreateAgentOptions): Promise<InitResult> {
  if (!config.model) {
    throw new Error(
      "No model configured. Set the MODEL environment variable (or use --model) to specify the model id."
    );
  }

  const { connection, modelInfo } = await resolveModelConfig({
    model: config.model,
    style: config.style,
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    modelInfo: config.modelInfo,
  });

  const agent = await agentManager.createManagedAgent({
    modelInfo,
    model: connection.model,
    name,
    systemPrompt: config.systemPrompt || (await buildDefaultSystemPrompt()),
    maxIterations: config.maxIterations,
    mcpConfigPath: config.mcpConfigPath || undefined,
    modelStyle: connection.style,
    modelBaseURL: connection.baseURL,
    modelApiKey: connection.apiKey,
    setUp: patchInstance,
  });

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
