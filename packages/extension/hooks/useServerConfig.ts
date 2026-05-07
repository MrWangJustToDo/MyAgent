import { createState } from "reactivity-store";

export const DEFAULT_SERVER_URL = "http://localhost:3100";

export const useServerConfig = createState(
  () => ({
    url: DEFAULT_SERVER_URL,
    connected: false,
    connecting: false,
    model: "",
    provider: "",
  }),
  {
    withActions: (s) => ({
      setUrl: (url: string) => {
        s.url = url;
      },
      setConnected: (connected: boolean) => {
        s.connected = connected;
      },
      setConnecting: (connecting: boolean) => {
        s.connecting = connecting;
      },
      setModel: (model: string) => {
        s.model = model;
      },
      setProvider: (provider: string) => {
        s.provider = provider;
      },
      reset: () => {
        s.connected = false;
        s.connecting = false;
        s.model = "";
        s.provider = "";
      },
    }),
    withDeepSelector: false,
    withStableSelector: true,
    withNamespace: "server-config",
    withPersist: "agent-server-config",
  }
);

export interface HealthResponse {
  status: "ready" | "initializing";
  model?: string;
  provider?: string;
}

export async function checkServerHealth(url: string): Promise<HealthResponse | null> {
  try {
    const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      return (await res.json()) as HealthResponse;
    }
    return null;
  } catch {
    return null;
  }
}
