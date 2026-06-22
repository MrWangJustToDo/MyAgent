import {
  AdapterProvider,
  App,
  configureEnv,
  initConfig,
  initHighlighter,
  useAgent,
  useAgentContext,
  useAgentLog,
  useTodoManager,
} from "@my-agent/app";
import { DEFAULT_OLLAMA_URL, registerCoreEnv } from "@my-agent/core";
import { createRemoteCoreEnv } from "@my-agent/server/client";
import { InkTerminalBox } from "@my-react/react-terminal/web";
import { useCallback, useEffect, useRef, useState } from "react";

import { ExtensionAgentAdapter } from "@/adapters/extension-adapter";
import { ConnectionGuard } from "@/components/ConnectionGuard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useServerConfig } from "@/hooks/useServerConfig";

import type { AgentAdapter } from "@my-agent/app";

configureEnv({ allowNonBrowserUpdates: true });

/**
 * Inner component rendered only when server connection is established.
 * Bootstraps remote CoreEnv, initializes config, creates adapter, then renders the shared App.
 */
const AgentBootstrap = () => {
  const url = useServerConfig((s) => s.url);
  const model = useServerConfig((s) => s.model);
  const provider = useServerConfig((s) => s.provider);
  const apiKey = useServerConfig((s) => s.apiKey);

  const [adapter, setAdapter] = useState<AgentAdapter | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const adapterRef = useRef<AgentAdapter | null>(null);
  const initIdRef = useRef(0);

  const runBootstrap = useCallback(async () => {
    const currentInitId = ++initIdRef.current;

    try {
      setLoading(true);
      setError("");

      if (adapterRef.current) {
        await adapterRef.current.destroy();
        adapterRef.current = null;
        setAdapter(null);
      }

      const env = await createRemoteCoreEnv(url);
      if (currentInitId !== initIdRef.current) return;
      registerCoreEnv(env);

      await initConfig({
        model,
        provider,
        apiKey,
        url: provider === "ollama" ? DEFAULT_OLLAMA_URL : "",
        debug: false,
      });
      if (currentInitId !== initIdRef.current) return;

      await initHighlighter();
      if (currentInitId !== initIdRef.current) return;

      const ext = new ExtensionAgentAdapter({
        hooks: { useAgent, useAgentLog, useAgentContext, useTodoManager },
      });

      adapterRef.current = ext;
      setAdapter(ext);
    } catch (err) {
      if (currentInitId !== initIdRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (currentInitId === initIdRef.current) {
        setLoading(false);
      }
    }
  }, [url, model, provider, apiKey]);

  useEffect(() => {
    runBootstrap();
    return () => {
      if (adapterRef.current) {
        void adapterRef.current.destroy();
        adapterRef.current = null;
      }
    };
  }, [runBootstrap]);

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: 24,
          height: "100%",
          color: "#d4d4d4",
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, color: "#f44336" }}>Initialization Error</h2>
        <p style={{ color: "#aaa", textAlign: "center", fontSize: 13, maxWidth: 360 }}>{error}</p>
        <button
          onClick={runBootstrap}
          style={{
            padding: "6px 16px",
            background: "#0070f3",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (loading || !adapter) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "#888",
          fontSize: 13,
        }}
      >
        Initializing agent...
      </div>
    );
  }

  return (
    <InkTerminalBox style={{ height: "100%" }}>
      <AdapterProvider value={adapter}>
        <App />
      </AdapterProvider>
    </InkTerminalBox>
  );
};

/**
 * Extension sidepanel entry point.
 * Wraps ConnectionGuard → AgentBootstrap → shared App.
 */
export const SidepanelApp = () => {
  return (
    <div style={{ height: "100vh", background: "#1e1e1e", color: "#d4d4d4" }}>
      <ErrorBoundary>
        <ConnectionGuard>
          <AgentBootstrap />
        </ConnectionGuard>
      </ErrorBoundary>
    </div>
  );
};
