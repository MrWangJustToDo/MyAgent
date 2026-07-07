/**
 * Model configuration — single entry for connection + metadata resolution.
 *
 * Two API styles:
 * - `openai`    — OpenAI-compatible chat completions (OpenAI, Ollama, DeepSeek, gateways)
 * - `anthropic` — Anthropic Messages API
 *
 * Each style uses: model + baseURL + apiKey. Defaults are overridable via env or modelInfo.
 */

import { parseModelInfoFromEnv } from "./model-env.js";
import { lookupModelFromModelsDev } from "./models-dev.js";

import type { ModelInfo, ModelStyle } from "./types.js";

export type { ModelStyle } from "./types.js";

// ============================================================================
// Types & defaults
// ============================================================================

export const DEFAULT_BASE_URLS: Record<ModelStyle, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
};

/** Default OpenAI-compatible URL for local endpoints (e.g. Ollama). */
export const DEFAULT_LOCAL_OPENAI_BASE_URL = "http://localhost:11434/v1";

export interface ModelConnection {
  style: ModelStyle;
  model: string;
  baseURL: string;
  apiKey: string;
}

export interface ResolveModelConfigInput {
  model?: string;
  style?: ModelStyle;
  baseURL?: string;
  apiKey?: string;
  modelInfo?: ModelInfo;
  env?: Record<string, string | undefined>;
}

export interface ResolvedModelConfig {
  connection: ModelConnection;
  modelInfo?: ModelInfo;
}

// ============================================================================
// Parsing
// ============================================================================

export function parseModelStyle(raw: string | undefined, fallback: ModelStyle = "openai"): ModelStyle {
  const value = raw?.trim().toLowerCase();
  if (value === "anthropic") return "anthropic";
  if (value === "openai") return "openai";
  return fallback;
}

function normalizeOpenAiCompatibleBaseURL(url: string): string {
  const trimmed = url.replace(/\/+$/, "");
  if (trimmed.endsWith("/v1")) return trimmed;
  return `${trimmed}/v1`;
}

function resolveBaseURLFromEnv(style: ModelStyle, env: Record<string, string | undefined>): string | undefined {
  const direct = env.BASE_URL || env.MODEL_BASE_URL;
  if (!direct) return undefined;
  return style === "openai" ? normalizeOpenAiCompatibleBaseURL(direct) : direct.replace(/\/+$/, "");
}

function resolveApiKeyFromEnv(env: Record<string, string | undefined>): string {
  return env.API_KEY ?? "";
}

/**
 * Resolve connection settings from env + optional overrides (no network).
 */
export function resolveModelConnection(input: ResolveModelConfigInput = {}): ModelConnection {
  const env = input.env ?? {};
  const style = input.style ?? parseModelStyle(env.MODEL_STYLE || env.STYLE);
  const model = input.model || env.MODEL || "";
  const baseURL =
    input.baseURL ||
    input.modelInfo?.baseURL ||
    resolveBaseURLFromEnv(style, env) ||
    (style === "openai" ? DEFAULT_BASE_URLS.openai : DEFAULT_BASE_URLS.anthropic);
  const apiKey = input.apiKey ?? resolveApiKeyFromEnv(env);

  return { style, model, baseURL, apiKey };
}

function mergeModelInfo(base: ModelInfo | undefined, override: ModelInfo | undefined): ModelInfo | undefined {
  if (!base && !override) return undefined;
  if (!base) return override;
  if (!override) return base;
  return {
    ...base,
    ...override,
    capabilities: override.capabilities.length > 0 ? override.capabilities : base.capabilities,
    pricing: override.pricing ?? base.pricing,
    reasoningConfig: override.reasoningConfig ?? base.reasoningConfig,
    baseURL: override.baseURL ?? base.baseURL,
  };
}

/**
 * Resolve connection + model metadata (models.dev lookup + MODEL_* env overrides).
 */
export async function resolveModelConfig(input: ResolveModelConfigInput = {}): Promise<ResolvedModelConfig> {
  const env = input.env ?? {};
  const connection = resolveModelConnection(input);

  const envInfo = connection.model
    ? parseModelInfoFromEnv(env, connection.model, connection.style === "anthropic" ? "anthropic" : "openai")
    : undefined;

  let lookedUp: ModelInfo | undefined;
  if (connection.model) {
    try {
      lookedUp = await lookupModelFromModelsDev(connection.model);
    } catch {
      lookedUp = undefined;
    }
  }

  const modelInfo = mergeModelInfo(lookedUp, mergeModelInfo(envInfo, input.modelInfo));

  const finalConnection: ModelConnection = {
    ...connection,
    baseURL: modelInfo?.baseURL ?? connection.baseURL,
  };

  return { connection: finalConnection, modelInfo };
}
