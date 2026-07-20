import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { usePreviewPorts } from "../hooks/use-preview-ports.js";
import { getBootedWebContainer } from "../webcontainer/create-env.js";

import { WorkspaceCodeTab } from "./WorkspaceCodeTab.js";

import type { WebContainer } from "@webcontainer/api";

const ROOT_PATH = "/";

type TabId = "preview" | "code";

export const WorkspacePanel = () => {
  const [activeTab, setActiveTab] = useState<TabId>("code");
  const [wc, setWc] = useState<WebContainer | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const rootPath = ROOT_PATH;

  // Preview tab state
  const ports = usePreviewPorts((s) => s.ports);
  const activePort = usePreviewPorts((s) => s.activePort);
  const { setActive } = usePreviewPorts.getActions();

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const [copyFlash, setCopyFlash] = useState(false);

  // Get WebContainer instance
  useEffect(() => {
    const wc = getBootedWebContainer();
    if (wc) setWc(wc);
    const check = setInterval(() => {
      const wc = getBootedWebContainer();
      if (wc) {
        setWc(wc);
        clearInterval(check);
      }
    }, 500);
    return () => clearInterval(check);
  }, []);

  // Listen for agent actions
  useEffect(() => {
    const handler = () => {
      setRefreshKey((k) => k + 1);
    };
    window.addEventListener("agent:action", handler);
    return () => window.removeEventListener("agent:action", handler);
  }, []);

  const active = useMemo(() => ports.find((p) => p.port === activePort) ?? null, [ports, activePort]);
  const iframeSrc = active?.ready ? active.url : (active?.url ?? "");

  const refresh = useCallback(() => {
    setIframeKey((k) => k + 1);
  }, []);

  const openExternal = useCallback(() => {
    if (active?.url) {
      window.open(active.url, "_blank", "noopener,noreferrer");
    }
  }, [active?.url]);

  const copyUrl = useCallback(async () => {
    if (!active?.url) return;
    try {
      await navigator.clipboard.writeText(active.url);
      setCopyFlash(true);
    } catch {
      // ignore
    }
  }, [active?.url]);

  useEffect(() => {
    if (!copyFlash) return;
    const id = window.setTimeout(() => setCopyFlash(false), 1200);
    return () => window.clearTimeout(id);
  }, [copyFlash]);

  return (
    <aside className="workspace-panel" aria-label="Workspace panel">
      <header className="workspace-panel__header">
        <div className="workspace-panel__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "preview"}
            className={
              activeTab === "preview" ? "workspace-panel__tab workspace-panel__tab--active" : "workspace-panel__tab"
            }
            onClick={() => setActiveTab("preview")}
          >
            Preview
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "code"}
            className={
              activeTab === "code" ? "workspace-panel__tab workspace-panel__tab--active" : "workspace-panel__tab"
            }
            onClick={() => setActiveTab("code")}
          >
            Code
          </button>
        </div>
      </header>

      {activeTab === "preview" && (
        <div className="workspace-panel__body">
          <div className="workspace-panel__preview-actions">
            <div className="workspace-panel__preview-tabs" role="tablist">
              {ports.length === 0 ? (
                <span className="workspace-panel__empty-tab">No ports</span>
              ) : (
                ports.map((p) => (
                  <button
                    key={p.port}
                    type="button"
                    role="tab"
                    aria-selected={p.port === activePort}
                    className={
                      p.port === activePort
                        ? "workspace-panel__preview-tab workspace-panel__preview-tab--active"
                        : "workspace-panel__preview-tab"
                    }
                    onClick={() => setActive(p.port)}
                  >
                    :{p.port}
                    {p.ready ? "" : "…"}
                  </button>
                ))
              )}
            </div>
            <div className="workspace-panel__preview-actions-btns">
              <button
                type="button"
                className="workspace-panel__btn"
                onClick={refresh}
                disabled={!iframeSrc}
                title="Refresh"
              >
                Refresh
              </button>
              <button
                type="button"
                className="workspace-panel__btn"
                onClick={openExternal}
                disabled={!iframeSrc}
                title="Open in new tab"
              >
                Open
              </button>
              <button
                type="button"
                className="workspace-panel__btn"
                onClick={() => void copyUrl()}
                disabled={!iframeSrc}
                title="Copy preview URL"
              >
                {copyFlash ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
          <div className="workspace-panel__preview-body">
            {iframeSrc ? (
              <iframe
                key={`${activePort}-${active?.ready ? "ready" : "open"}-${iframeKey}`}
                ref={iframeRef}
                className="workspace-panel__iframe"
                title={`Preview :${activePort ?? ""}`}
                src={iframeSrc}
                allow="accelerometer; camera; encrypted-media; geolocation; gyroscope; microphone; midi; clipboard-read; clipboard-write"
              />
            ) : (
              <div className="workspace-panel__placeholder">
                Start a server (e.g. <code>npm run dev</code>) to preview.
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "code" && wc && (
        <div className="workspace-panel__body">
          <WorkspaceCodeTab wc={wc} rootPath={rootPath} refreshKey={refreshKey} />
        </div>
      )}

      {activeTab === "code" && !wc && (
        <div className="workspace-panel__body">
          <div className="workspace-panel__placeholder">Waiting for WebContainer…</div>
        </div>
      )}
    </aside>
  );
};
