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
import { clearCoreEnv, hasCoreEnv, registerCoreEnv } from "@my-agent/core";
import { InkTerminalBox } from "@my-react/react-terminal/web";
import { useCallback, useEffect, useRef, useState } from "react";

import { PlaygroundAgentAdapter } from "./adapters/playground-adapter.js";
import { ConfigPanel } from "./components/ConfigPanel.js";
import { usePlaygroundConfig } from "./hooks/use-playground-config.js";
import { getWebContainerEnv } from "./webcontainer/create-env.js";

import type { AgentAdapter } from "@my-agent/app";

configureEnv({ allowNonBrowserUpdates: true });

const AgentBootstrap = () => {
  const model = usePlaygroundConfig((s) => s.model);
  const style = usePlaygroundConfig((s) => s.style);
  const baseURL = usePlaygroundConfig((s) => s.baseURL);
  const apiKey = usePlaygroundConfig((s) => s.apiKey);

  const [adapter, setAdapter] = useState<AgentAdapter | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Booting WebContainer…");
  const adapterRef = useRef<AgentAdapter | null>(null);
  const containerReadyRef = useRef(false);
  const initIdRef = useRef(0);

  const ensureCoreEnv = useCallback(async () => {
    if (hasCoreEnv()) return;

    const env = await getWebContainerEnv();
    registerCoreEnv(env);
    containerReadyRef.current = true;
  }, []);

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

      setStatus(containerReadyRef.current ? "Restarting agent…" : "Booting WebContainer…");
      await ensureCoreEnv();
      if (currentInitId !== initIdRef.current) return;

      setStatus("Initializing agent…");
      await initConfig({
        model,
        style,
        baseURL,
        apiKey,
        debug: false,
      });
      if (currentInitId !== initIdRef.current) return;

      await initHighlighter();
      if (currentInitId !== initIdRef.current) return;

      const playground = new PlaygroundAgentAdapter({
        hooks: { useAgent, useAgentLog, useAgentContext, useTodoManager },
      });

      adapterRef.current = playground;
      setAdapter(playground);
    } catch (err) {
      if (currentInitId !== initIdRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (currentInitId === initIdRef.current) {
        setLoading(false);
      }
    }
  }, [model, style, baseURL, apiKey, ensureCoreEnv]);

  useEffect(() => {
    void runBootstrap();
    return () => {
      if (adapterRef.current) {
        void adapterRef.current.destroy();
        adapterRef.current = null;
      }
      clearCoreEnv();
    };
  }, [runBootstrap]);

  if (error) {
    return (
      <div className="center-panel">
        <h2>Initialization error</h2>
        <p>{error}</p>
        <button type="button" onClick={() => void runBootstrap()}>
          Retry
        </button>
      </div>
    );
  }

  if (loading || !adapter) {
    return (
      <div className="center-panel">
        <span className="spinner" />
        <span>{status}</span>
      </div>
    );
  }

  return (
    <InkTerminalBox style={{ height: "100%" }} inkRenderOptions={{ exitOnCtrlC: false }}>
      <AdapterProvider value={adapter}>
        <App />
      </AdapterProvider>
    </InkTerminalBox>
  );
};

export const PlaygroundApp = () => {
  return (
    <div className="playground-shell">
      <ConfigPanel />
      <div className="playground-terminal">
        <AgentBootstrap />
      </div>
    </div>
  );
};
