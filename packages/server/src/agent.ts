import {
  agentManager,
  createDeepSeekModel,
  createModelFromId,
  createOllamaModel,
  createOpenRouterModel,
  createOpenAICompatibleModel,
  getOllamaBuildInTools,
} from "@my-agent/core";

import { buildDefaultSystemPrompt } from "./prompt.js";

import type { Agent, LanguageModel, ModelInfo } from "@my-agent/core";
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
  let modelInfo: ModelInfo | undefined;
  let extendTools: ToolSet = {};

  // Try registry-based creation first
  try {
    const result = createModelFromId(model, { apiKey, baseURL: url });
    languageModel = result.model;
    modelInfo = result.info;
  } catch {
    if (provider === "ollama") {
      languageModel = createOllamaModel(model, url, { reasoning: true });
    } else if (provider === "openaiCompatible") {
      languageModel = createOpenAICompatibleModel(model, url);
    } else if (provider === "deepseek") {
      languageModel = createDeepSeekModel(model, apiKey, url !== "http://localhost:11434" ? url : undefined);
    } else {
      languageModel = createOpenRouterModel(model, apiKey);
    }
  }

  if (provider === "ollama") {
    extendTools = getOllamaBuildInTools((p) => ({
      ["ollama-web-fetch"]: p.tools.webFetch(),
      ["ollama-web-search"]: p.tools.webSearch(),
    }));
  }

  const agent = await agentManager.createManagedAgent({
    languageModel,
    modelInfo,
    model,
    rootPath,
    name: "server-agent",
    systemPrompt: systemPrompt || buildDefaultSystemPrompt(rootPath),
    maxIterations,
    mcpConfigPath: mcpConfigPath || undefined,
  });

  agent.addTools(extendTools);

  return agent;
}
