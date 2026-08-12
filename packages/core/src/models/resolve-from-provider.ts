/**
 * Resolve model connection using the registered {@link ModelProvider}.
 *
 * When the provider reports `mode: "proxy"`, baseURL and apiKey are forced from
 * the provider so clients cannot bypass the key-holding proxy.
 */

import { resolveModelConfig, type ResolveModelConfigInput, type ResolvedModelConfig } from "./model-config.js";
import { getModelProvider, type ModelProviderMode } from "./model-provider.js";

import type { ModelStyle } from "./types.js";

function asStyle(value: string | undefined): ModelStyle | undefined {
  if (value === "openai" || value === "anthropic") return value;
  return undefined;
}

export interface ResolvedModelConfigFromProvider extends ResolvedModelConfig {
  /** Mode reported by the registered {@link ModelProvider}. */
  providerMode: ModelProviderMode;
}

/**
 * Resolve connection + model metadata, merging AppConfig overrides with the
 * registered {@link ModelProvider}.
 */
export async function resolveModelConfigFromProvider(
  input: ResolveModelConfigInput = {}
): Promise<ResolvedModelConfigFromProvider> {
  const providerConn = await getModelProvider().getConnection();

  const merged: ResolveModelConfigInput = {
    ...input,
    model: input.model?.trim() ? input.model : providerConn.model,
    style: input.style ?? asStyle(providerConn.style),
    baseURL: input.baseURL ?? providerConn.baseURL,
    apiKey: input.apiKey ?? providerConn.apiKey,
  };

  if (providerConn.mode === "proxy") {
    // Proxy mode: never allow client baseURL/apiKey (or mismatched style) to bypass the server.
    merged.baseURL = providerConn.baseURL;
    merged.apiKey = providerConn.apiKey;
    merged.style = providerConn.style;
    if (!merged.model?.trim()) {
      merged.model = providerConn.model;
    }
  }

  const resolved = await resolveModelConfig(merged);

  if (providerConn.mode === "proxy") {
    // resolveModelConfig may overwrite baseURL from models.dev / MODEL_* metadata —
    // re-force the proxy endpoint so LLM traffic stays on the provider server.
    return {
      connection: {
        ...resolved.connection,
        style: providerConn.style,
        baseURL: providerConn.baseURL,
        apiKey: providerConn.apiKey,
        model: resolved.connection.model?.trim() ? resolved.connection.model : providerConn.model,
      },
      modelInfo: resolved.modelInfo ? { ...resolved.modelInfo, baseURL: undefined } : undefined,
      providerMode: "proxy",
    };
  }

  return {
    ...resolved,
    providerMode: providerConn.mode,
  };
}
