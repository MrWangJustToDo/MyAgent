import { useCallback, useEffect, useMemo, useState } from "react";

import { usePreviewPorts } from "../hooks/use-preview-ports.js";
import { useShellState } from "../hooks/use-shell-state.js";
import { Button } from "../ui/Button.js";
import { cx } from "../ui/cx.js";
import { Segmented } from "../ui/Field.js";
import { IconClose, IconCode, IconCopy, IconExternal, IconGrid, IconPlay, IconRefresh } from "../ui/icons.js";
import { State } from "../ui/State.js";
import { getBootedWebContainer } from "../webcontainer/create-env.js";

import { VariantsPanel } from "./VariantsPanel.js";
import { WorkspaceCodeTab } from "./WorkspaceCodeTab.js";

import type { WorkspaceTab } from "../hooks/use-shell-state.js";
import type { WebContainer } from "@webcontainer/api";
import type { ReactNode } from "react";

const ROOT_PATH = "/";

const TAB_OPTIONS: { value: WorkspaceTab; label: string; icon: ReactNode }[] = [
  { value: "preview", label: "Preview", icon: <IconPlay size={12} /> },
  { value: "variants", label: "Variants", icon: <IconGrid size={12} /> },
  { value: "code", label: "Code", icon: <IconCode size={12} /> },
];

/** Files written by the agent/editor bump this so the tree and editor re-read. */
function useAgentRefreshKey() {
  const [key, setKey] = useState(0);
  useEffect(() => {
    const handler = () => setKey((k) => k + 1);
    window.addEventListener("agent:action", handler);
    return () => window.removeEventListener("agent:action", handler);
  }, []);
  return key;
}

function useWebContainer(): WebContainer | null {
  const [wc, setWc] = useState<WebContainer | null>(() => getBootedWebContainer());
  useEffect(() => {
    if (wc) return;
    const check = setInterval(() => {
      const booted = getBootedWebContainer();
      if (booted) setWc(booted);
    }, 500);
    return () => clearInterval(check);
  }, [wc]);
  return wc;
}

export interface WorkspacePanelProps {
  /** True when the shell renders this inside a `Sheet` (compact viewport). */
  asSheet?: boolean;
  onClose: () => void;
}

/**
 * Workspace surface: Preview / Variants / Code.
 *
 * The shell owns *where* it lives (side pane vs sheet); this component owns only
 * its tabs and header, so one body renders in both placements.
 */
export const WorkspacePanel = ({ asSheet = false, onClose }: WorkspacePanelProps) => {
  const activeTab = useShellState((s) => s.workspaceTab);
  const previewNonce = useShellState((s) => s.previewNonce);
  const { setWorkspaceTab, bumpPreviewNonce, setPreviewUrl, setExportOpen } = useShellState.getActions();

  const wc = useWebContainer();
  const refreshKey = useAgentRefreshKey();

  const ports = usePreviewPorts((s) => s.ports);
  const activePort = usePreviewPorts((s) => s.activePort);
  const { setActive } = usePreviewPorts.getActions();

  const [copyFlash, setCopyFlash] = useState(false);

  const active = useMemo(() => ports.find((p) => p.port === activePort) ?? null, [ports, activePort]);
  const iframeSrc = active?.url ?? "";

  // Publish the active preview URL so shell-level actions (palette, status bar) can use it.
  useEffect(() => {
    setPreviewUrl(iframeSrc || null);
    return () => setPreviewUrl(null);
  }, [iframeSrc, setPreviewUrl]);

  const refresh = useCallback(() => bumpPreviewNonce(), [bumpPreviewNonce]);

  const openExternal = useCallback(() => {
    if (iframeSrc) window.open(iframeSrc, "_blank", "noopener,noreferrer");
  }, [iframeSrc]);

  const copyUrl = useCallback(async () => {
    if (!iframeSrc) return;
    try {
      await navigator.clipboard.writeText(iframeSrc);
      setCopyFlash(true);
    } catch {
      // clipboard unavailable (permissions / insecure context)
    }
  }, [iframeSrc]);

  useEffect(() => {
    if (!copyFlash) return;
    const id = window.setTimeout(() => setCopyFlash(false), 1200);
    return () => window.clearTimeout(id);
  }, [copyFlash]);

  return (
    <section className="workspace" aria-label="Workspace">
      <header className={asSheet ? "workspace__header workspace__header--sheet" : "workspace__header"}>
        <Segmented
          label="Workspace view"
          size="sm"
          options={TAB_OPTIONS}
          value={activeTab}
          onChange={(tab) => setWorkspaceTab(tab)}
        />
        <div className="workspace__header-spacer" />
        {activeTab === "code" && (
          <Button size="sm" variant="ghost" icon={<IconExternal size={13} />} onClick={() => setExportOpen(true)}>
            Export
          </Button>
        )}
        {/* The sheet supplies its own close affordance. */}
        {!asSheet && (
          <Button
            size="sm"
            variant="ghost"
            iconOnly
            icon={<IconClose size={13} />}
            aria-label="Close workspace panel"
            onClick={onClose}
          />
        )}
      </header>

      <div className="workspace__body">
        {activeTab === "preview" && (
          <div className="preview">
            <div className="preview__bar">
              <div className="preview__ports" role="tablist" aria-label="Preview ports">
                {ports.length === 0 ? (
                  <span className="preview__ports-empty">No server listening</span>
                ) : (
                  ports.map((p) => (
                    <button
                      key={p.port}
                      type="button"
                      role="tab"
                      aria-selected={p.port === activePort}
                      className={cx("port", p.port === activePort && "port--active")}
                      onClick={() => setActive(p.port)}
                      title={p.url}
                    >
                      <span className={`port__dot port__dot--${p.ready ? "ready" : "pending"}`} aria-hidden="true" />:
                      {p.port}
                    </button>
                  ))
                )}
              </div>

              <div className="preview__actions">
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  icon={<IconRefresh size={13} />}
                  aria-label="Reload preview"
                  disabled={!iframeSrc}
                  onClick={refresh}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  icon={<IconExternal size={13} />}
                  aria-label="Open preview in a new tab"
                  disabled={!iframeSrc}
                  onClick={openExternal}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  icon={<IconCopy size={13} />}
                  aria-label="Copy preview URL"
                  disabled={!iframeSrc}
                  onClick={() => void copyUrl()}
                />
              </div>
            </div>

            <div className="preview__frame">
              {iframeSrc ? (
                <iframe
                  key={`${activePort}-${active?.ready ? "ready" : "open"}-${previewNonce}`}
                  className="preview__iframe"
                  title={`Preview on port ${activePort ?? ""}`}
                  src={iframeSrc}
                  allow="accelerometer; camera; encrypted-media; geolocation; gyroscope; microphone; midi; clipboard-read; clipboard-write"
                />
              ) : (
                <State
                  icon={<IconPlay size={19} />}
                  title="No preview yet"
                  hint={
                    <>
                      Start a server inside the workspace — for example <code>npm run dev</code> — and its port shows up
                      here automatically.
                    </>
                  }
                />
              )}
            </div>

            {copyFlash && <div className="preview__flash">URL copied</div>}
          </div>
        )}

        {activeTab === "variants" && (
          <div className="workspace__fill">
            <VariantsPanel />
          </div>
        )}

        {activeTab === "code" &&
          (wc ? (
            <div className="workspace__fill">
              <WorkspaceCodeTab wc={wc} rootPath={ROOT_PATH} refreshKey={refreshKey} />
            </div>
          ) : (
            <State loading title="Booting workspace" hint="Waiting for the WebContainer filesystem…" />
          ))}
      </div>
    </section>
  );
};
