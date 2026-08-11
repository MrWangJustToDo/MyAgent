/**
 * Shared agent initialization logic extracted from LocalAgentAdapter and ExtensionAgentAdapter.
 * Both adapters delegate to this helper to avoid duplicating ~80 lines of identical setup code.
 */

import { agentManager, buildDefaultSystemPrompt, resolveModelConfigFromCoreEnv } from "@my-agent/core";
import { reactive, toRaw } from "reactivity-store";

import { clearExtensionCommands, syncExtensionCommands } from "../commands";

import type { AppConfig, InitResult } from "./types.js";
import type { useAgentLog as useAgentLogType } from "../hooks/use-agent-log.js";
import type { useAgent as useAgentType } from "../hooks/use-agent.js";
import type { useTodoManager as useTodoManagerType } from "../hooks/use-todo-manager.js";
import type { AgentSession, ManagedAgent } from "@my-agent/core";
import type { UIMessage } from "@tanstack/ai";

/** Wire LocalAgentSession into the app store (call after `initChat`). */
export function bindAgentSession(session: AgentSession | null, hooks: Pick<AdapterHooks, "useAgent">): void {
  hooks.useAgent.getActions().setSession(session);
}

export interface AdapterHooks {
  useAgent: typeof useAgentType;
  useAgentLog: typeof useAgentLogType;
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
  const { connection, modelInfo } = await resolveModelConfigFromCoreEnv({
    model: config.model,
    style: config.style,
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    modelInfo: config.modelInfo,
  });

  if (!connection.model?.trim()) {
    throw new Error(
      "No model configured. Set MODEL on the CoreEnv host (or use --model). With --remote, the server MODEL is used when local MODEL is empty."
    );
  }

  const agent = await agentManager.createManagedAgent({
    modelInfo,
    model: connection.model,
    name,
    systemPrompt: config.systemPrompt || (await buildDefaultSystemPrompt()),
    maxIterations: config.maxIterations,
    mcpConfigPath: config.mcpConfigPath || undefined,
    extensionDirs: config.extensionDirs?.length ? config.extensionDirs : undefined,
    modelStyle: connection.style,
    modelBaseURL: connection.baseURL,
    modelApiKey: connection.apiKey,
    setUp: patchInstance,
  });

  const { useAgent, useAgentLog, useTodoManager } = hooks;

  const todoManager = agent.getTodoManager();

  useAgent.getActions().setAgent(agent);
  useAgent.getActions().setSession(null);
  useAgentLog.getActions().setLog(toRaw(agent.getLog()));
  useTodoManager.getActions().setManager(toRaw(todoManager ?? null));

  syncExtensionCommands(agent);

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
  clearExtensionCommands();
  hooks.useAgent.getActions().setAgent(null);
  hooks.useAgent.getActions().setSession(null);
  hooks.useAgentLog.getActions().setLog(null);
  hooks.useTodoManager.getActions().setManager(null);
}
