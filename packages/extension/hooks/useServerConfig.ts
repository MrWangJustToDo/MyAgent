import { DEFAULT_LOCAL_OPENAI_BASE_URL, type ModelStyle } from "@my-agent/core";
import { createState } from "reactivity-store";

export const DEFAULT_SERVER_URL = "http://localhost:3100";

export const useServerConfig = createState(
  () => ({
    url: DEFAULT_SERVER_URL,
    connected: false,
    connecting: false,
    rootPath: "",
    sandboxEnv: "",
    model: "",
    style: "openai" as ModelStyle,
    baseURL: DEFAULT_LOCAL_OPENAI_BASE_URL,
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
      setStyle: (style: ModelStyle) => {
        s.style = style;
      },
      setBaseURL: (baseURL: string) => {
        s.baseURL = baseURL;
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
