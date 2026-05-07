import {
  agentManager,
  createDeepSeekModel,
  createOllamaModel,
  createOpenRouterModel,
  createOpenAICompatibleModel,
  getOllamaBuildInTools,
} from "@my-agent/core";

import type { Agent, LanguageModel } from "@my-agent/core";
import type { ToolSet } from "ai";

export interface ServerAgentConfig {
  model: string;
  provider: "ollama" | "openRouter" | "openaiCompatible" | "deepseek";
  url: string;
  apiKey?: string;
  rootPath: string;
  maxIterations?: number;
  systemPrompt?: string;
  mcpConfigPath?: string;
}

export async function createServerAgent(config: ServerAgentConfig): Promise<Agent> {
  const { model, provider, url, apiKey, rootPath, maxIterations = 50, systemPrompt, mcpConfigPath } = config;

  let languageModel: LanguageModel | null = null;
  let extendTools: ToolSet = {};

  if (provider === "ollama") {
    languageModel = createOllamaModel(model, url, { reasoning: true });
    extendTools = getOllamaBuildInTools((p) => ({
      ["ollama-web-fetch"]: p.tools.webFetch(),
      ["ollama-web-search"]: p.tools.webSearch(),
    }));
  } else if (provider === "openaiCompatible") {
    languageModel = createOpenAICompatibleModel(model, url);
  } else if (provider === "deepseek") {
    languageModel = createDeepSeekModel(model, apiKey, url !== "http://localhost:11434" ? url : undefined);
  } else {
    languageModel = createOpenRouterModel(model, apiKey);
  }

  const agent = await agentManager.createManagedAgent({
    languageModel,
    model,
    rootPath,
    name: "server-agent",
    systemPrompt:
      systemPrompt ||
      "You are a helpful coding assistant. You can read, write, and modify files, run commands in bash, and help with programming tasks.",
    maxIterations,
    mcpConfigPath: mcpConfigPath || undefined,
  });

  agent.addTools(extendTools);

  return agent;
}
