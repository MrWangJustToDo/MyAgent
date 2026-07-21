import { DEFAULT_BASE_URLS, DEFAULT_LOCAL_OPENAI_BASE_URL } from "@my-agent/core";
import { useCallback, useEffect, useState } from "react";

import { checkServerHealth, useServerConfig } from "@/hooks/useServerConfig";

import type { ModelStyle } from "@my-agent/core";
import type { ChangeEvent } from "react";

const STYLES = [
  { value: "openai", label: "OpenAI" },
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
    void handleCheck();
  }, [handleCheck]);

  const openSidePanel = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.sidePanel.open({ tabId: tab.id });
      window.close();
    }
  };

  return (
    <div className="min-w-[340px] bg-[#131313] p-4 text-[#d4d4d4] select-none">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-b from-blue-500 to-blue-700">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          </div>
          <span className="text-sm font-semibold">Agent</span>
        </div>
        <span
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
            connected ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
          }`}
        >
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${connected ? "bg-green-400" : "bg-red-400"}`} />
          {connected ? "Connected" : "Disconnected"}
        </span>
      </div>

      <div className="mb-3 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-3">
        <div className="mb-1.5 block text-[11px] font-medium tracking-wider text-[#666] uppercase">Server</div>
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <input
              id="server-url"
              value={url}
              onChange={(e: ChangeEvent<HTMLInputElement>) => actions.setUrl(e.target.value)}
              className="w-full rounded-lg border border-[#333] bg-[#222] px-2.5 py-1.5 text-sm text-[#d4d4d4] placeholder-[#555] transition-all outline-none focus:border-blue-500/50 focus:bg-[#252525] focus:shadow-[0_0_0_1px_rgba(59,130,246,0.15)]"
              placeholder="http://localhost:3100"
            />
          </div>
          <button
            onClick={handleCheck}
            disabled={checking}
            className={`flex items-center justify-center rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all outline-none ${
              checking
                ? "cursor-not-allowed bg-neutral-800 text-neutral-600"
                : "cursor-pointer bg-[#2a2a2a] text-[#999] hover:bg-[#333] hover:text-[#ccc] active:scale-[0.97]"
            }`}
          >
            {checking ? (
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#555] border-t-[#999]" />
            ) : (
              "Test"
            )}
          </button>
        </div>
      </div>

      <div className="mb-3 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-3">
        <div className="mb-2.5 block text-[11px] font-medium tracking-wider text-[#666] uppercase">API</div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-[12px] text-[#888]">Style</span>
            <select
              value={style}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => actions.setStyle(e.target.value as ModelStyle)}
              className="flex-1 rounded-lg border border-[#333] bg-[#222] px-2 py-1.5 text-sm text-[#d4d4d4] transition-all outline-none focus:border-blue-500/50 focus:bg-[#252525] focus:shadow-[0_0_0_1px_rgba(59,130,246,0.15)]"
            >
              {STYLES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-[12px] text-[#888]">Base URL</span>
            <input
              value={baseURL}
              onChange={(e: ChangeEvent<HTMLInputElement>) => actions.setBaseURL(e.target.value)}
              placeholder={style === "openai" ? DEFAULT_LOCAL_OPENAI_BASE_URL : DEFAULT_BASE_URLS.anthropic}
              className="flex-1 rounded-lg border border-[#333] bg-[#222] px-2.5 py-1.5 text-sm text-[#d4d4d4] placeholder-[#555] transition-all outline-none focus:border-blue-500/50 focus:bg-[#252525] focus:shadow-[0_0_0_1px_rgba(59,130,246,0.15)]"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-[12px] text-[#888]">Model</span>
            <input
              value={model}
              onChange={(e: ChangeEvent<HTMLInputElement>) => actions.setModel(e.target.value)}
              placeholder="e.g. qwen2.5-coder:7b"
              className="flex-1 rounded-lg border border-[#333] bg-[#222] px-2.5 py-1.5 text-sm text-[#d4d4d4] placeholder-[#555] transition-all outline-none focus:border-blue-500/50 focus:bg-[#252525] focus:shadow-[0_0_0_1px_rgba(59,130,246,0.15)]"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-[12px] text-[#888]">
              Key
              {style === "anthropic" && <span className="ml-0.5 text-amber-400">*</span>}
            </span>
            <input
              type="password"
              value={apiKey}
              onChange={(e: ChangeEvent<HTMLInputElement>) => actions.setApiKey(e.target.value)}
              placeholder={style === "anthropic" ? "sk-ant-..." : "optional"}
              className="flex-1 rounded-lg border border-[#333] bg-[#222] px-2.5 py-1.5 text-sm text-[#d4d4d4] placeholder-[#555] transition-all outline-none focus:border-blue-500/50 focus:bg-[#252525] focus:shadow-[0_0_0_1px_rgba(59,130,246,0.15)]"
            />
          </div>
        </div>
      </div>

      {connected && rootPath && (
        <div className="mb-3 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2">
          <div className="text-[11px] text-[#666]">Workspace Root</div>
          <div className="mt-0.5 truncate font-mono text-[12px] text-[#999]">{rootPath}</div>
        </div>
      )}

      <button
        onClick={openSidePanel}
        disabled={!connected}
        className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-all outline-none ${
          connected
            ? "cursor-pointer bg-blue-600 text-white shadow-sm shadow-blue-600/20 hover:bg-blue-500 active:scale-[0.98] active:bg-blue-700"
            : "cursor-not-allowed bg-neutral-800 text-neutral-600"
        }`}
      >
        {connected ? "Open Chat" : "Connect to start"}
      </button>
    </div>
  );
}

export default App;
