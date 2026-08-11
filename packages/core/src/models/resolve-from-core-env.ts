/**
 * Resolve model connection using optional {@link CoreEnv.provider} defaults.
 *
 * When the provider reports `mode: "proxy"`, baseURL and apiKey are forced from
 * the provider so clients cannot bypass the remote key-holding proxy.
 */

import { getEnv } from "../env.js";

import { resolveModelConfig, type ResolveModelConfigInput, type ResolvedModelConfig } from "./model-config.js";

import type { ModelStyle } from "./types.js";

function asStyle(value: string | undefined): ModelStyle | undefined {
  if (value === "openai" || value === "anthropic") return value;
  return undefined;
}

/**
 * Resolve connection + model metadata, merging AppConfig overrides with
 * {@link CoreEnv.provider} when registered.
 */
export async function resolveModelConfigFromCoreEnv(input: ResolveModelConfigInput = {}): Promise<ResolvedModelConfig> {
  const env = getEnv();
  const providerConn = env.provider ? await env.provider.getConnection() : undefined;

  const merged: ResolveModelConfigInput = {
    ...input,
    model: input.model?.trim() ? input.model : providerConn?.model,
    style: input.style ?? asStyle(providerConn?.style),
    baseURL: input.baseURL ?? providerConn?.baseURL,
    apiKey: input.apiKey ?? providerConn?.apiKey,
  };

  if (providerConn?.mode === "proxy") {
    // Proxy mode: never allow client baseURL/apiKey (or mismatched style) to bypass the server.
    merged.baseURL = providerConn.baseURL;
    merged.apiKey = providerConn.apiKey;
    merged.style = providerConn.style;
    if (!merged.model?.trim()) {
      merged.model = providerConn.model;
    }
  }

  return resolveModelConfig(merged);
}
