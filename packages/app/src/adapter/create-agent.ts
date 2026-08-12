/**
 * Shared agent initialization — Host + Session for the app (no ManagedAgent to UI).
 */

import {
  agentManager,
  buildDefaultSystemPrompt,
  createLocalAgentSessionHost,
  resolveModelConfigFromProvider,
} from "@my-agent/core";

import { clearExtensionCommands, syncExtensionCommands } from "../commands";
import { useConfig } from "../hooks/use-config.js";

import type { AppConfig, InitResult } from "./types.js";
import type { useAgentLog as useAgentLogType } from "../hooks/use-agent-log.js";
import type { useAgent as useAgentType } from "../hooks/use-agent.js";
import type { useTodoManager as useTodoManagerType } from "../hooks/use-todo-manager.js";
import type { AgentSession, AgentSessionHost } from "@my-agent/core";

/** Wire AgentSession (+ Host) into the app store. */
export function bindAgentSession(
  session: AgentSession | null,
  hooks: Pick<AdapterHooks, "useAgent">,
  host?: AgentSessionHost | null
): void {
  hooks.useAgent.getActions().setSession(session);
  if (host !== undefined) {
    hooks.useAgent.getActions().setHost(host);
  }
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

export async function createAgentFromConfig({ config, name, hooks }: CreateAgentOptions): Promise<InitResult> {
  const { connection, modelInfo, providerMode } = await resolveModelConfigFromProvider({
    model: config.model,
    style: config.style,
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    modelInfo: config.modelInfo,
  });

  if (!connection.model?.trim()) {
    throw new Error(
      "No model configured. Set MODEL / --model, or use --provider-remote so the provider server supplies MODEL."
    );
  }

  useConfig.getActions().updateConfig({
    model: connection.model,
    style: connection.style,
    baseURL: connection.baseURL,
    apiKey: providerMode === "proxy" ? "" : connection.apiKey,
    modelInfo,
    providerMode,
  });

  const host = createLocalAgentSessionHost({ manager: agentManager });
  const { session, initialMessages } = await host.create({
    name,
    model: connection.model,
    systemPrompt: config.systemPrompt || (await buildDefaultSystemPrompt()),
    maxIterations: config.maxIterations,
    mcpConfigPath: config.mcpConfigPath || undefined,
    extensionDirs: config.extensionDirs?.length ? config.extensionDirs : undefined,
    modelStyle: connection.style,
    modelBaseURL: connection.baseURL,
    modelApiKey: connection.apiKey,
    modelInfo,
    continueSession: config.continueSession || undefined,
    resumeSessionId: config.resumeSession && config.resumeSession !== "__picker__" ? config.resumeSession : undefined,
    ...(config.toolConfig ? { toolConfig: config.toolConfig } : {}),
  });

  const { useAgent, useAgentLog, useTodoManager } = hooks;
  const snap = session.getSnapshot();
  const initial = initialMessages ?? [];

  useAgent.getActions().setHost(host);
  useAgent.getActions().setSession(session);
  useAgentLog.getActions().clear();
  useTodoManager.getActions().setFromSession(snap.todos, snap.todosTitle);
  syncExtensionCommands(session);

  return { host, session, ...(initial.length ? { initialMessages: initial } : {}) };
}

export function clearAdapterHooks(hooks: AdapterHooks): void {
  clearExtensionCommands();
  hooks.useAgent.getActions().setHost(null);
  hooks.useAgent.getActions().setSession(null);
  hooks.useAgentLog.getActions().clear();
  hooks.useTodoManager.getActions().clear();
}
