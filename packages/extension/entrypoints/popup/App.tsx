import { DEFAULT_BASE_URLS, DEFAULT_LOCAL_OPENAI_BASE_URL } from "@my-agent/core";
import { useCallback, useEffect, useState } from "react";

import { checkServerHealth, useServerConfig } from "@/hooks/useServerConfig";

import type { ChangeEvent } from "react";
import type { ModelStyle } from "@my-agent/core";

const STYLES = [
  { value: "openai", label: "OpenAI-compatible" },
  { value: "anthropic", label: "Anthropic" },
] as const;

function App() {
  const url = useServerConfig((s) => s.url);
  const connected = useServerConfig((s) => s.connected);
  const model = useServerConfig((s) => s.model);
  const style = useServerConfig((s) => s.style);
  const baseURL = useServerConfig((s) => s.baseURL);
  const apiKey = useServerConfig((s) => s.apiKey);
  const rootPath = useServerConfig((s) => s.rootPath);
  const actions = useServerConfig.getActions();
  const [checking, setChecking] = useState(false);

  const handleCheck = useCallback(async () => {
    setChecking(true);
    const health = await checkServerHealth(url);
    if (health && health.status === "ok") {
      actions.setConnected(true);
      actions.setRootPath(health.rootPath ?? "");
      actions.setSandboxEnv(health.sandboxEnv ?? "");
    } else {
      actions.setConnected(false);
      actions.setRootPath("");
    }
    setChecking(false);
  }, [url, actions]);

  useEffect(() => {
    handleCheck();
  }, [handleCheck]);

  const openSidePanel = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.sidePanel.open({ tabId: tab.id });
      window.close();
    }
  };

  return (
    <div style={{ padding: 8, minWidth: 320 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontWeight: 600 }}>My Agent</span>
        <span
          style={{
            fontSize: 12,
            padding: "2px 8px",
            borderRadius: 12,
            background: connected ? "#d4edda" : "#f8d7da",
            color: connected ? "#155724" : "#721c24",
          }}
        >
          {connected ? "Connected" : "Disconnected"}
        </span>
      </div>

      <div style={{ marginBottom: 8 }}>
        <label htmlFor="server-url" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
          Server URL
        </label>
        <div style={{ display: "flex", gap: 4 }}>
          <input
            id="server-url"
            value={url}
            onChange={(e: ChangeEvent<HTMLInputElement>) => actions.setUrl(e.target.value)}
            style={{ flex: 1, padding: "4px 8px", border: "1px solid #ccc", borderRadius: 4, fontSize: 13 }}
          />
          <button onClick={handleCheck} disabled={checking} style={{ padding: "4px 8px", fontSize: 12 }}>
            {checking ? "..." : "Check"}
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 8 }}>
        <label htmlFor="style-select" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
          API Style
        </label>
        <select
          id="style-select"
          value={style}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => actions.setStyle(e.target.value as ModelStyle)}
          style={{ width: "100%", padding: "4px 8px", border: "1px solid #ccc", borderRadius: 4, fontSize: 13 }}
        >
          {STYLES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 8 }}>
        <label htmlFor="base-url-input" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
          Base URL
        </label>
        <input
          id="base-url-input"
          value={baseURL}
          onChange={(e: ChangeEvent<HTMLInputElement>) => actions.setBaseURL(e.target.value)}
          placeholder={style === "openai" ? DEFAULT_LOCAL_OPENAI_BASE_URL : DEFAULT_BASE_URLS.anthropic}
          style={{ width: "100%", padding: "4px 8px", border: "1px solid #ccc", borderRadius: 4, fontSize: 13 }}
        />
      </div>

      <div style={{ marginBottom: 8 }}>
        <label htmlFor="model-input" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
          Model
        </label>
        <input
          id="model-input"
          value={model}
          onChange={(e: ChangeEvent<HTMLInputElement>) => actions.setModel(e.target.value)}
          placeholder="e.g. qwen2.5-coder:7b"
          style={{ width: "100%", padding: "4px 8px", border: "1px solid #ccc", borderRadius: 4, fontSize: 13 }}
        />
      </div>

      <div style={{ marginBottom: 8 }}>
        <label htmlFor="apikey-input" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
          API Key {style === "anthropic" ? "(required)" : "(optional for local)"}
        </label>
        <input
          id="apikey-input"
          type="password"
          value={apiKey}
          onChange={(e: ChangeEvent<HTMLInputElement>) => actions.setApiKey(e.target.value)}
          style={{ width: "100%", padding: "4px 8px", border: "1px solid #ccc", borderRadius: 4, fontSize: 13 }}
        />
      </div>

      {connected && rootPath && (
        <div style={{ fontSize: 12, color: "#666", marginBottom: 12 }}>
          <div>
            Root: <strong>{rootPath}</strong>
          </div>
        </div>
      )}

      <button
        onClick={openSidePanel}
        disabled={!connected}
        style={{
          width: "100%",
          padding: "8px 16px",
          background: connected ? "#0070f3" : "#ccc",
          color: "#fff",
          border: "none",
          borderRadius: 4,
          cursor: connected ? "pointer" : "not-allowed",
          fontSize: 13,
        }}
      >
        Open Chat
      </button>
    </div>
  );
}

export default App;
