import { agentManager, createOllamaModel, getOllamaBuildInTools } from "@my-agent/core";
import { reactive, toRaw } from "reactivity-store";

import { useTodoManager } from "../hooks";
import { useAgent } from "../hooks/use-agent";
import { useAgentContext } from "../hooks/use-agent-context";
import { useAgentLog } from "../hooks/use-agent-log";
import { useAgentSandbox } from "../hooks/use-agent-sandbox";

import type { Agent, AgentContext } from "@my-agent/core";

export const createAgent = async ({
  model,
  url,
  rootPath,
  systemPrompt,
  maxIterations,
}: {
  model: string;
  url: string;
  rootPath: string;
  systemPrompt?: string;
  maxIterations: number;
}) => {
  const languageModel = createOllamaModel(model, url, { reasoning: true });

  const tools = getOllamaBuildInTools((p) => ({
    ["ollama-web-fetch"]: p.tools.webFetch(),
    ["ollama-web-search"]: p.tools.webSearch(),
  }));

  const agent = await agentManager.createManagedAgent({
    languageModel,
    model,
    rootPath,
    name: "local-chat",
    systemPrompt:
      systemPrompt ||
      "You are a helpful coding assistant. You can read, write, and modify files, run commands in bash, and help with programming tasks.",
    maxIterations,
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

  agent.addTools(tools);

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
  useAgentLog.getActions().setLog(agent.getLog());
  useAgentContext.getActions().setContext(agent.getContext());
  useAgentSandbox.getActions().setSandbox(agent.getSandbox());
  useTodoManager.getActions().setManager(todoManager ?? null);

  return agent;
};
