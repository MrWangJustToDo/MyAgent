import { createState } from "reactivity-store";

export const DEFAULT_SERVER_URL = "http://localhost:3100";

export const useServerConfig = createState(
  () => ({
    url: DEFAULT_SERVER_URL,
    connected: false,
    connecting: false,
    rootPath: "",
    sandboxEnv: "",
    // Agent config (user-configurable)
    model: "qwen2.5-coder:7b",
    provider: "ollama" as "ollama" | "openRouter" | "openaiCompatible" | "deepseek",
    apiKey: "",
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
      setRootPath: (rootPath: string) => {
        s.rootPath = rootPath;
      },
      setSandboxEnv: (sandboxEnv: string) => {
        s.sandboxEnv = sandboxEnv;
      },
      setModel: (model: string) => {
        s.model = model;
      },
      setProvider: (provider: "ollama" | "openRouter" | "openaiCompatible" | "deepseek") => {
        s.provider = provider;
      },
      setApiKey: (apiKey: string) => {
        s.apiKey = apiKey;
      },
      reset: () => {
        s.connected = false;
        s.connecting = false;
        s.rootPath = "";
        s.sandboxEnv = "";
      },
    }),
    withDeepSelector: false,
    withStableSelector: true,
    withNamespace: "server-config",
    withPersist: "agent-server-config",
  }
);

export interface HealthResponse {
  status: "ok" | "error";
  rootPath?: string;
  sandboxEnv?: string;
  error?: string;
}

export async function checkServerHealth(url: string): Promise<HealthResponse | null> {
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      return (await res.json()) as HealthResponse;
    }
    return null;
  } catch {
    return null;
  }
}
