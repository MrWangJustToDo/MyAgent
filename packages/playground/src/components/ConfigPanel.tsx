import { useCallback, useState } from "react";

import { useDraggableBubble } from "../hooks/use-draggable-bubble.js";
import { usePlaygroundConfig } from "../hooks/use-playground-config.js";

import { ExportWorkspaceDialog } from "./ExportWorkspaceDialog.js";

import type { ModelStyle } from "@my-agent/core";

const BUBBLE_STORAGE_KEY = "my-agent-playground-settings-bubble";

export const ConfigPanel = () => {
  const model = usePlaygroundConfig((s) => s.model);
  const style = usePlaygroundConfig((s) => s.style);
  const baseURL = usePlaygroundConfig((s) => s.baseURL);
  const apiKey = usePlaygroundConfig((s) => s.apiKey);
  const providerServerUrl = usePlaygroundConfig((s) => s.providerServerUrl);
  const fetchProxyUrl = usePlaygroundConfig((s) => s.fetchProxyUrl);
  const { setConfig } = usePlaygroundConfig.getActions();

  const workspaceVisible = usePlaygroundConfig((s) => s.workspaceVisible);
  const [open, setOpen] = useState(() => !apiKey && !providerServerUrl);
  const [exportOpen, setExportOpen] = useState(false);
  const [draft, setDraft] = useState({
    model,
    style,
    baseURL,
    apiKey,
    providerServerUrl,
    fetchProxyUrl,
    workspaceVisible,
  });

  // Proxy mode: the provider server URL is set → local model / base URL / API key are ignored.
  const proxyMode = Boolean(draft.providerServerUrl.trim());

  const openPanel = useCallback(() => setOpen(true), []);
  const { position, bubbleSize, pointerHandlers } = useDraggableBubble(BUBBLE_STORAGE_KEY, openPanel);

  return (
    <>
      {!open ? (
        <button
          type="button"
          className="config-bubble"
          aria-label="Settings"
          title="Settings (drag to move)"
          style={{ left: position.x, top: position.y, width: bubbleSize, height: bubbleSize }}
          {...pointerHandlers}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeWidth="1.7" />
            <path
              d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.58 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.65 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.08A1.7 1.7 0 0 0 10.12 3V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ) : (
        <div className="config-panel" role="dialog" aria-label="Playground settings">
          <div className="config-panel__header">
            <div className="config-panel__title">
              <span className="config-panel__title-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeWidth="1.7" />
                  <path
                    d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.58 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.65 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.08A1.7 1.7 0 0 0 10.12 3V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className="config-panel__title-text">
                <strong>Playground settings</strong>
                <span className="config-panel__subtitle">Provider &amp; environment</span>
              </span>
            </div>
            <button type="button" className="config-panel__close" onClick={() => setOpen(false)} aria-label="Close">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="config-panel__body">
            <section className="config-panel__section">
              <h3 className="config-panel__section-title">Model provider</h3>
              <label className={proxyMode ? "config-panel__disabled" : undefined}>
                Model
                <input
                  value={draft.model}
                  disabled={proxyMode}
                  placeholder="gpt-4o"
                  onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))}
                />
              </label>
              <label className={proxyMode ? "config-panel__disabled" : undefined}>
                Style
                <select
                  value={draft.style}
                  disabled={proxyMode}
                  onChange={(e) => setDraft((d) => ({ ...d, style: e.target.value as ModelStyle }))}
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                </select>
              </label>
              <label className={proxyMode ? "config-panel__disabled" : undefined}>
                Base URL
                <input
                  value={draft.baseURL}
                  disabled={proxyMode}
                  placeholder="https://api.openai.com/v1"
                  onChange={(e) => setDraft((d) => ({ ...d, baseURL: e.target.value }))}
                />
              </label>
              <label className={proxyMode ? "config-panel__disabled" : undefined}>
                API key
                <input
                  type="password"
                  value={draft.apiKey}
                  disabled={proxyMode}
                  onChange={(e) => setDraft((d) => ({ ...d, apiKey: e.target.value }))}
                  placeholder="stored in localStorage"
                />
              </label>
            </section>

            <section className="config-panel__section">
              <h3 className="config-panel__section-title">Remote</h3>
              <label>
                Provider server URL
                <input
                  value={draft.providerServerUrl}
                  onChange={(e) => setDraft((d) => ({ ...d, providerServerUrl: e.target.value }))}
                  placeholder="http://localhost:3100"
                />
              </label>
              <span className={`config-panel__mode ${proxyMode ? "config-panel__mode--proxy" : ""}`}>
                {proxyMode
                  ? "Proxy mode — local model / base URL / API key are ignored"
                  : "Direct mode — using local provider settings"}
              </span>
              <label>
                Fetch proxy URL
                <input
                  value={draft.fetchProxyUrl}
                  onChange={(e) => setDraft((d) => ({ ...d, fetchProxyUrl: e.target.value }))}
                  placeholder="https://….workers.dev (required on GitHub Pages)"
                />
              </label>
            </section>

            <section className="config-panel__section">
              <h3 className="config-panel__section-title">Workspace</h3>
              <label className="config-panel__toggle">
                <span>Show workspace panel</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={workspaceVisible}
                  onChange={(e) => {
                    setConfig({ workspaceVisible: e.target.checked });
                    setDraft((d) => ({ ...d, workspaceVisible: e.target.checked }));
                  }}
                />
              </label>
            </section>

            <p className="config-panel__hint">
              <strong>Provider server URL</strong> switches to <em>proxy mode</em>: the server holds the API key (local
              model / base URL / key are ignored). Only works if the server's CORS allows this origin.
            </p>
            <p className="config-panel__hint">
              WebContainer cannot bypass CORS for webfetch/websearch. Locally Vite proxies at{" "}
              <code>/__fetch_proxy</code>. On GitHub Pages, deploy <code>packages/playground/workers/fetch-proxy</code>{" "}
              and paste the Worker URL here.
            </p>
          </div>

          <div className="config-panel__footer">
            <button
              type="button"
              className="config-panel__save"
              onClick={() => {
                setConfig(draft);
                setOpen(false);
              }}
            >
              Save &amp; restart agent
            </button>
            <button
              type="button"
              className="config-panel__export"
              onClick={() => {
                setExportOpen(true);
                setOpen(false);
              }}
            >
              Export workspace
            </button>
          </div>
        </div>
      )}
      {exportOpen && <ExportWorkspaceDialog onClose={() => setExportOpen(false)} />}
    </>
  );
};
