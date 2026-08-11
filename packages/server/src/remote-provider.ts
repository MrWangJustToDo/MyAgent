/**
 * Build a CoreEnv.provider that points TanStack adapters at the server proxy.
 */

import { REMOTE_PROVIDER_API_KEY } from "./provider-constants.js";

import type { CoreEnvModelProvider } from "@my-agent/core";

type ProviderInfoClient = {
  provider: {
    info: {
      $get: () => Promise<Response>;
    };
  };
};

async function unwrapJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return (await response.json()) as T;
}

/**
 * Fetch `/api/provider/info` and return a proxy-mode provider, or `undefined`
 * when the server does not expose the route (older CoreEnv servers).
 */
export async function tryCreateRemoteModelProvider(
  client: ProviderInfoClient,
  serverBaseUrl: string
): Promise<CoreEnvModelProvider | undefined> {
  try {
    const infoRes = await client.provider.info.$get();
    if (!infoRes.ok) return undefined;
    const info = await unwrapJson<{
      mode: "proxy";
      style: "openai" | "anthropic";
      model: string;
      basePath: string;
    }>(infoRes);
    return {
      getConnection: async () => ({
        mode: "proxy",
        style: info.style,
        model: info.model,
        baseURL: `${serverBaseUrl}${info.basePath}`,
        apiKey: REMOTE_PROVIDER_API_KEY,
      }),
    };
  } catch {
    return undefined;
  }
}
