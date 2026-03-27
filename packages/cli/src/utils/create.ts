import { agentManager, createOllamaModel, createOpenRouterModel, getOllamaBuildInTools } from "@my-agent/core";
import { reactive, toRaw } from "reactivity-store";

import { useTodoManager } from "../hooks";
import { useAgent } from "../hooks/use-agent";
import { useAgentContext } from "../hooks/use-agent-context";
import { useAgentLog } from "../hooks/use-agent-log";
import { useAgentSandbox } from "../hooks/use-agent-sandbox";

import type { CliAgentConfig } from "../hooks";
import type { Agent, AgentContext, LanguageModel } from "@my-agent/core";
import type { ToolSet } from "ai";

export const createAgent = async ({
  model,
  url,
  rootPath,
  systemPrompt,
  maxIterations,
  provider,
  apiKey,
  mcpConfigPath,
}: {
  model: CliAgentConfig["model"];
  url: CliAgentConfig["url"];
  rootPath: CliAgentConfig["rootPath"];
  systemPrompt?: CliAgentConfig["systemPrompt"];
  maxIterations: CliAgentConfig["maxIterations"];
  provider: CliAgentConfig["provider"];
  apiKey?: CliAgentConfig["apiKey"];
  mcpConfigPath?: CliAgentConfig["mcpConfigPath"];
}) => {
  let languageModel: LanguageModel | null = null;

  let extendTools: ToolSet = {};

  if (provider === "ollama") {
    languageModel = createOllamaModel(model, url, { reasoning: true });

    extendTools = getOllamaBuildInTools((p) => ({
      ["ollama-web-fetch"]: p.tools.webFetch(),
      ["ollama-web-search"]: p.tools.webSearch(),
    }));
  } else {
    languageModel = createOpenRouterModel(model, apiKey);
  }

  const agent = await agentManager.createManagedAgent({
    languageModel,
    model,
    rootPath,
    name: "local-chat",
    systemPrompt:
      systemPrompt ||
      "You are a helpful coding assistant. You can read, write, and modify files, run commands in bash, and help with programming tasks.",
    maxIterations,
    mcpConfigPath: mcpConfigPath || undefined,
    setUp: (instance: (Agent | AgentContext) & { ["$$symbol"]?: symbol }) => {
      if (instance["$$symbol"]) return instance;
      instance["$$symbol"] = Symbol.for("patch");
      const pInstance = reactive(instance);
      // make all the class.action change trigger update so reactivity-store can observe it
      return new Proxy(pInstance, {
        get(target, p, receiver) {
          const key = p.toString()?.toLowerCase?.() || "";
          // fix error when vue reactivity and zod work together
          if (key.includes("tool") || key.includes("config")) {
            return toRaw(Reflect.get(target, p, receiver));
          }
          return Reflect.get(target, p, receiver);
        },
      }) as Agent | AgentContext;
    },
  });

  agent.addTools(extendTools);

  // Get TodoManager from agent (created by AgentManager)
  const todoManager = agent.getTodoManager();

  // Subscribe to TodoManager changes to refresh UI state
  if (todoManager) {
    todoManager.onChange(() => {
      useTodoManager.getActions().refresh();
    });
  }

  // Set up global agent state
  useAgent.getActions().setAgent(agent);
  useAgentLog.getActions().setLog(toRaw(agent.getLog()));
  useAgentContext.getActions().setContext(toRaw(agent.getContext()));
  useAgentSandbox.getActions().setSandbox(toRaw(agent.getSandbox()));
  useTodoManager.getActions().setManager(toRaw(todoManager ?? null));

  return agent;
};
