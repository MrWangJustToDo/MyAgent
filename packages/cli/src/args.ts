import { DEFAULT_OLLAMA_URL, parseModelInfoFromEnv } from "@my-agent/core";

import type { AppConfig, Provider } from "@my-agent/app";
import type { ModelProvider } from "@my-agent/core";

// ============================================================================
// Argument Parsing
// ============================================================================

interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = { positional: [], flags: {} };
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith("-")) {
        result.flags[key] = nextArg;
        i += 2;
      } else {
        result.flags[key] = true;
        i += 1;
      }
    } else if (arg.startsWith("-") && arg.length > 1) {
      const key = arg.slice(1);
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith("-")) {
        result.flags[key] = nextArg;
        i += 2;
      } else {
        result.flags[key] = true;
        i += 1;
      }
    } else {
      result.positional.push(arg);
      i += 1;
    }
  }
  return result;
}

function getFlag(args: ParsedArgs, ...keys: string[]): string | boolean | undefined {
  for (const key of keys) {
    if (args.flags[key] !== undefined) return args.flags[key];
  }
  return undefined;
}

function getFlagString(args: ParsedArgs, defaultValue: string, ...keys: string[]): string {
  const value = getFlag(args, ...keys);
  return typeof value === "string" ? value : defaultValue;
}

function getFlagNumber(args: ParsedArgs, defaultValue: number, ...keys: string[]): number {
  const value = getFlag(args, ...keys);
  if (typeof value === "string") {
    const num = parseInt(value, 10);
    return isNaN(num) ? defaultValue : num;
  }
  return defaultValue;
}

function getFlagBoolean(args: ParsedArgs, ...keys: string[]): boolean {
  const value = getFlag(args, ...keys);
  return value === true || value === "true";
}

// ============================================================================
// Environment Helpers
// ============================================================================

const getEnv = (key: string, fallback: string = ""): string => process.env[key] ?? fallback;

const getEnvProvider = (key: string, fallback: Provider = "ollama"): Provider => {
  const value = process.env[key]?.toLowerCase();
  if (value === "ollama") return "ollama";
  if (value === "openrouter") return "openRouter";
  if (value === "openai-compatible" || value === "openaicompatible") return "openaiCompatible";
  if (value === "deepseek") return "deepseek";
  return fallback;
};

// ============================================================================
// Main Export
// ============================================================================

export interface ParsedCliConfig extends Partial<AppConfig> {
  remote?: string;
}

export function parseCliArgs(argv: string[]): ParsedCliConfig {
  const parsed = parseArgs(argv);

  const envModel = getEnv("MODEL") || getEnv("model");
  const envUrl = getEnv("URL") || getEnv("OLLAMA_URL") || getEnv("OPENAI_COMPATIBLE_URL") || getEnv("url");
  const envProvider = getEnvProvider("PROVIDER") || getEnvProvider("provider");
  const envApiKey = getEnv("API_KEY") || getEnv("OPENROUTER_API_KEY") || getEnv("DEEPSEEK_API_KEY") || getEnv("apiKey");
  const envMaxIterations = getEnv("MAX_ITERATIONS") || getEnv("maxIterations");

  const envMaxIter = envMaxIterations ? parseInt(envMaxIterations, 10) : 50;

  let provider: Provider = envProvider;
  const cliProvider = getFlagString(parsed, "", "provider");
  if (
    cliProvider === "ollama" ||
    cliProvider === "openRouter" ||
    cliProvider === "openrouter" ||
    cliProvider === "openai-compatible" ||
    cliProvider === "openaicompatible" ||
    cliProvider === "deepseek"
  ) {
    if (cliProvider === "openrouter") provider = "openRouter";
    else if (cliProvider === "openai-compatible" || cliProvider === "openaicompatible") provider = "openaiCompatible";
    else provider = cliProvider as Provider;
  }

  let resumeSession = "";
  const resumeFlag = getFlag(parsed, "resume", "r");
  if (typeof resumeFlag === "string") {
    resumeSession = resumeFlag;
  } else if (resumeFlag === true) {
    resumeSession = "__picker__";
  }

  const envMcpConfig = getEnv("MCP_CONFIG_PATH");
  const envRemote = getEnv("REMOTE") || getEnv("REMOTE_URL");

  const remoteFlag = getFlag(parsed, "remote", "R");
  const remote = typeof remoteFlag === "string" ? remoteFlag : envRemote || undefined;

  // Resolve model metadata from MODEL_* env vars (context window, pricing,
  // capabilities, multimodal flag, reasoning config, etc).
  // The active MODEL value is the id; provider maps to a registry ModelProvider
  // so resolveModelInfoFromEnv can fill in a sensible default when MODEL_PROVIDER
  // is not set explicitly.
  const providerToModelProvider: Record<Provider, ModelProvider> = {
    ollama: "ollama",
    openRouter: "open-router",
    openaiCompatible: "openai",
    deepseek: "deepseek",
  };
  // No default model — the user must configure MODEL (env) or --model (flag).
  // An empty model will surface as a clear error in createAgentFromConfig.
  const envModelId = getFlagString(parsed, envModel, "model", "m");
  const modelInfo = parseModelInfoFromEnv(process.env, envModelId, providerToModelProvider[provider]);

  return {
    model: envModelId,
    url: getFlagString(parsed, envUrl || DEFAULT_OLLAMA_URL, "url", "u"),
    systemPrompt: getFlagString(parsed, "", "system", "s"),
    initialPrompt: parsed.positional.join(" "),
    maxIterations: getFlagNumber(parsed, isNaN(envMaxIter) ? 50 : envMaxIter, "max-iterations"),
    debug: getFlagBoolean(parsed, "debug", "d"),
    provider,
    apiKey: getFlagString(parsed, envApiKey, "api-key", "k"),
    mcpConfigPath: getFlagString(parsed, envMcpConfig, "mcp-config"),
    continueSession: getFlagBoolean(parsed, "continue", "c"),
    resumeSession,
    remote,
    ...(modelInfo ? { modelInfo } : {}),
  };
}

export const isHelpRequested = (argv: string[]): boolean => {
  const parsed = parseArgs(argv);
  return getFlagBoolean(parsed, "help", "h");
};
