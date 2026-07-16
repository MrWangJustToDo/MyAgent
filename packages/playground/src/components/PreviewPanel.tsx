import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { usePreviewPorts } from "../hooks/use-preview-ports.js";

export const PreviewPanel = () => {
  const ports = usePreviewPorts((s) => s.ports);
  const activePort = usePreviewPorts((s) => s.activePort);
  const panelOpen = usePreviewPorts((s) => s.panelOpen);
  const { setActive, setPanelOpen } = usePreviewPorts.getActions();

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const [copyFlash, setCopyFlash] = useState(false);

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

  if (!panelOpen) {
    return null;
  }

  return (
    <aside className="preview-panel" aria-label="WebContainer preview">
      <header className="preview-panel__header">
        <div className="preview-panel__tabs" role="tablist">
          {ports.length === 0 ? (
            <span className="preview-panel__empty-tab">No ports</span>
          ) : (
            ports.map((p) => (
              <button
                key={p.port}
                type="button"
                role="tab"
                aria-selected={p.port === activePort}
                className={
                  p.port === activePort ? "preview-panel__tab preview-panel__tab--active" : "preview-panel__tab"
                }
                onClick={() => setActive(p.port)}
              >
                :{p.port}
                {p.ready ? "" : "…"}
              </button>
            ))
          )}
        </div>
        <div className="preview-panel__actions">
          <button type="button" className="preview-panel__btn" onClick={refresh} disabled={!iframeSrc} title="Refresh">
            Refresh
          </button>
          <button
            type="button"
            className="preview-panel__btn"
            onClick={openExternal}
            disabled={!iframeSrc}
            title="Open in new tab"
          >
            Open
          </button>
          <button
            type="button"
            className="preview-panel__btn"
            onClick={() => void copyUrl()}
            disabled={!iframeSrc}
            title="Copy preview URL"
          >
            {copyFlash ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            className="preview-panel__btn"
            onClick={() => setPanelOpen(false)}
            title="Collapse preview"
          >
            Close
          </button>
        </div>
      </header>
      <div className="preview-panel__body">
        {iframeSrc ? (
          <iframe
            key={`${activePort}-${active?.ready ? "ready" : "open"}-${iframeKey}`}
            ref={iframeRef}
            className="preview-panel__iframe"
            title={`Preview :${activePort ?? ""}`}
            src={iframeSrc}
            allow="accelerometer; camera; encrypted-media; geolocation; gyroscope; microphone; midi; clipboard-read; clipboard-write"
          />
        ) : (
          <div className="preview-panel__placeholder">
            Start a server (e.g. <code>npm run dev</code>) to preview.
          </div>
        )}
      </div>
    </aside>
  );
};

/** Floating toggle when ports exist but the panel is collapsed. */
export const PreviewToggle = () => {
  const ports = usePreviewPorts((s) => s.ports);
  const panelOpen = usePreviewPorts((s) => s.panelOpen);
  const { setPanelOpen } = usePreviewPorts.getActions();

  if (panelOpen || ports.length === 0) {
    return null;
  }

  return (
    <button type="button" className="preview-toggle" onClick={() => setPanelOpen(true)}>
      Preview ({ports.length})
    </button>
  );
};
