import { parseModelInfoFromEnv, parseModelStyle, resolveModelConnection } from "@my-agent/core";

import type { AppConfig } from "@my-agent/app";
import type { ModelStyle } from "@my-agent/core";

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

function parseCliStyle(raw: string | undefined): ModelStyle | undefined {
  if (!raw) return undefined;
  return parseModelStyle(raw);
}

// ============================================================================
// Environment Helpers
// ============================================================================

const getEnv = (key: string, fallback: string = ""): string => process.env[key] ?? fallback;

// ============================================================================
// Main Export
// ============================================================================

export interface ParsedCliConfig extends Partial<AppConfig> {
  remote?: string;
}

export function parseCliArgs(argv: string[]): ParsedCliConfig {
  const parsed = parseArgs(argv);

  const envModel = getEnv("MODEL") || getEnv("model");
  const envMaxIterations = getEnv("MAX_ITERATIONS") || getEnv("maxIterations");
  const envMaxIter = envMaxIterations ? parseInt(envMaxIterations, 10) : 50;

  const cliStyle = parseCliStyle(getFlagString(parsed, "", "style"));
  const cliBaseURL = getFlagString(parsed, "", "base-url", "baseURL", "url", "u");
  const cliApiKey = getFlagString(parsed, "", "api-key", "k");

  const envModelId = getFlagString(parsed, envModel, "model", "m");
  const connection = resolveModelConnection({
    model: envModelId,
    style: cliStyle,
    baseURL: cliBaseURL || undefined,
    apiKey: cliApiKey || undefined,
    env: process.env,
  });

  const modelInfo = connection.model
    ? parseModelInfoFromEnv(process.env, connection.model, connection.style === "anthropic" ? "anthropic" : "openai")
    : undefined;

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

  // Extra dirs from CLI only; `AGENT_EXTENSION_DIRS` is read in core `getDefaultExtensionDirs`.
  const extensionDirsRaw = getFlagString(parsed, "", "extension-dirs", "extension-dir");
  const extensionDirs = extensionDirsRaw
    .split(",")
    .map((d) => d.trim())
    .filter((d) => d.length > 0);

  return {
    model: connection.model,
    style: connection.style,
    baseURL: connection.baseURL,
    apiKey: connection.apiKey,
    systemPrompt: getFlagString(parsed, "", "system", "s"),
    initialPrompt: parsed.positional.join(" "),
    maxIterations: getFlagNumber(parsed, isNaN(envMaxIter) ? 50 : envMaxIter, "max-iterations"),
    debug: getFlagBoolean(parsed, "debug", "d"),
    mcpConfigPath: getFlagString(parsed, envMcpConfig, "mcp-config"),
    extensionDirs,
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
