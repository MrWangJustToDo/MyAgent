/**
 * Build a ModelProvider that points TanStack adapters at a remote provider proxy.
 *
 * Orthogonal to CoreEnv — pass any server base URL that exposes `/api/provider/*`.
 */

import { REMOTE_PROVIDER_API_KEY } from "./provider-constants.js";

import type { ModelProvider } from "@my-agent/core";

type ProviderInfoResponse = {
  mode: "proxy";
  style: "openai" | "anthropic";
  model: string;
  basePath: string;
};

/**
 * Fetch `/api/provider/info` and return a proxy-mode {@link ModelProvider}.
 *
 * @throws if the server does not expose provider info or returns an error.
 */
export async function createProxyModelProvider(serverUrl: string): Promise<ModelProvider> {
  const baseUrl = serverUrl.replace(/\/+$/, "");
  const infoRes = await fetch(`${baseUrl}/api/provider/info`);
  if (!infoRes.ok) {
    throw new Error(
      `Provider proxy unavailable at ${baseUrl}/api/provider/info (HTTP ${infoRes.status}). ` +
        `Start a server that exposes /api/provider or omit --provider-remote for local keys.`
    );
  }
  const info = (await infoRes.json()) as ProviderInfoResponse;
  if (info.mode !== "proxy" || !info.basePath || !info.style) {
    throw new Error(`Invalid provider info from ${baseUrl}/api/provider/info`);
  }
  return {
    getConnection: async () => ({
      mode: "proxy",
      style: info.style,
      model: info.model ?? "",
      baseURL: `${baseUrl}${info.basePath}`,
      apiKey: REMOTE_PROVIDER_API_KEY,
    }),
  };
}
