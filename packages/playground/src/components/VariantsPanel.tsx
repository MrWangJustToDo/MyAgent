import { useAgent } from "@my-agent/app";
import { isActiveStatus } from "@my-agent/core";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useVariants } from "../hooks/use-variants.js";
import { getBootedWebContainer } from "../webcontainer/create-env.js";
import { scanVariants } from "../webcontainer/scan-variants.js";

import type { OnMount } from "@monaco-editor/react";

const MonacoEditor = lazy(() => import("@monaco-editor/react").then((m) => ({ default: m.Editor })));

const EXT_LANG: Record<string, string> = { html: "html" };

function extToLang(filename: string): string {
  const dotIdx = filename.lastIndexOf(".");
  if (dotIdx === -1) return "plaintext";
  return EXT_LANG[filename.slice(dotIdx + 1).toLowerCase()] ?? "plaintext";
}

const MIN_COUNT = 1;
const MAX_COUNT = 4;

function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * v0-like "Variants" panel: generate N self-contained HTML variants via the
 * agent, compare them as live previews, toggle preview↔code, and iterate.
 */
export const VariantsPanel = () => {
  const session = useAgent((s) => s.session);

  const variants = useVariants((s) => s.variants);
  const activeVariantId = useVariants((s) => s.activeVariantId);
  const { setVariants, setActive } = useVariants.getActions();

  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(2);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [view, setView] = useState<"preview" | "code">("preview");
  const [iterate, setIterate] = useState("");
  const [iframeKey, setIframeKey] = useState(0);

  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  const active = useMemo(() => variants.find((v) => v.id === activeVariantId) ?? null, [variants, activeVariantId]);

  // Track agent busy state from the session snapshot.
  useEffect(() => {
    if (!session) {
      setBusy(false);
      return;
    }
    const read = () => setBusy(isActiveStatus(session.getSnapshot().status));
    read();
    return session.subscribe(read, { channels: ["state"] });
  }, [session]);

  const rescan = useCallback(async () => {
    const wc = getBootedWebContainer();
    if (!wc) return;
    const found = await scanVariants(wc.fs, "/");
    setVariants(found);
  }, [setVariants]);

  // Discover variants whenever the agent mutates the workspace, plus initial.
  useEffect(() => {
    void rescan();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void rescan(), 400);
    };
    window.addEventListener("agent:action", schedule);
    return () => {
      window.removeEventListener("agent:action", schedule);
      if (timer) clearTimeout(timer);
    };
  }, [rescan]);

  // Poll once if the WebContainer wasn't booted yet (same pattern as WorkspacePanel).
  useEffect(() => {
    if (getBootedWebContainer()) return;
    const id = setInterval(() => {
      if (getBootedWebContainer()) {
        clearInterval(id);
        void rescan();
      }
    }, 500);
    return () => clearInterval(id);
  }, [rescan]);

  const generate = useCallback(() => {
    if (!session || !prompt.trim() || generating) return;
    const n = Math.max(MIN_COUNT, Math.min(MAX_COUNT, count));
    const message =
      `Create ${n} distinct UI variants for: ${prompt.trim()}. ` +
      `Write each as a single self-contained HTML file (all CSS and JS inline, no external or relative ` +
      `resource references) to /variant-1.html ... /variant-${n}.html. Make each variant a genuinely different ` +
      `design direction so I can compare them side by side.`;
    setGenerating(true);
    void session.dispatch({ type: "send", content: message }).finally(() => setGenerating(false));
  }, [session, prompt, count, generating]);

  const deleteActive = useCallback(async () => {
    if (!active) return;
    const wc = getBootedWebContainer();
    if (!wc) return;
    await wc.fs.rm(active.id, { force: true }).catch(() => {});
    window.dispatchEvent(new CustomEvent("agent:action"));
    await rescan();
  }, [active, rescan]);

  const exportActive = useCallback(() => {
    if (!active) return;
    downloadText(active.name, active.html);
  }, [active]);

  const refreshPreview = useCallback(() => setIframeKey((k) => k + 1), []);

  const openExternal = useCallback(() => {
    if (!active) return;
    const blob = new Blob([active.html], { type: "text/html" });
    window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
  }, [active]);

  const sendIterate = useCallback(() => {
    if (!session || !active || !iterate.trim() || busy) return;
    const message =
      `Update the UI variant at ${active.id} per this request: ${iterate.trim()}. ` +
      `Rewrite the file in place as a single self-contained HTML file (inline CSS/JS only). ` +
      `Do not create new files; keep the filename ${active.name}.`;
    setIterate("");
    void session.dispatch({ type: "send", content: message });
  }, [session, active, iterate, busy]);

  const editorValue = active?.html ?? "";

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monaco.editor.defineTheme("playground-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#101013",
        "editor.foreground": "#ededed",
        "editorLineNumber.foreground": "#3f3f46",
        "editorLineNumber.activeForeground": "#a1a1aa",
        "editor.selectionBackground": "#8b8bff33",
        "editor.inactiveSelectionBackground": "#8b8bff1a",
        "editor.lineHighlightBackground": "#ffffff06",
        "editorCursor.foreground": "#a8a8ff",
        "editorWidget.background": "#17171b",
        "editorWidget.border": "#ffffff12",
        "dropdown.background": "#17171b",
        "input.background": "#0d0d10",
        focusBorder: "#8b8bff66",
      },
    });
    monaco.editor.setTheme("playground-dark");
  }, []);

  return (
    <div className="variants-panel">
      {/* Composer */}
      <div className="variants-panel__composer">
        <textarea
          className="variants-panel__input"
          placeholder="Describe the UI you want to build…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
        />
        <div className="variants-panel__composer-row">
          <label className="variants-panel__count">
            Variants
            <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="variants-panel__generate"
            onClick={generate}
            disabled={!session || !prompt.trim() || generating}
          >
            {generating ? "Generating…" : "Generate"}
          </button>
        </div>
        {!session && <span className="variants-panel__hint">Agent is still booting…</span>}
      </div>

      {/* Card strip */}
      {variants.length > 0 ? (
        <div className="variants-panel__strip" role="tablist" aria-label="Variants">
          {variants.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={v.id === activeVariantId}
              className={
                v.id === activeVariantId ? "variants-panel__card variants-panel__card--active" : "variants-panel__card"
              }
              onClick={() => setActive(v.id)}
            >
              <span className="variants-panel__thumb">
                <iframe title={v.name} srcDoc={v.html} sandbox="" loading="lazy" tabIndex={-1} aria-hidden="true" />
              </span>
              <span className="variants-panel__card-name">{v.name.replace(/\.html$/i, "")}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="variants-panel__empty">
          <span className="variants-panel__empty-title">No variants yet</span>
          <span>Generate variants and they will appear here automatically.</span>
        </div>
      )}

      {/* Active variant */}
      {active ? (
        <div className="variants-panel__stage">
          <div className="variants-panel__stage-bar">
            <div className="variants-panel__toggle" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={view === "preview"}
                className={
                  view === "preview"
                    ? "variants-panel__toggle-btn variants-panel__toggle-btn--active"
                    : "variants-panel__toggle-btn"
                }
                onClick={() => setView("preview")}
              >
                Preview
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === "code"}
                className={
                  view === "code"
                    ? "variants-panel__toggle-btn variants-panel__toggle-btn--active"
                    : "variants-panel__toggle-btn"
                }
                onClick={() => setView("code")}
              >
                Code
              </button>
            </div>
            <span className="variants-panel__stage-name">{active.name}</span>
            <div className="variants-panel__stage-spacer" />
            <button type="button" className="workspace-panel__btn" onClick={refreshPreview} title="Refresh preview">
              Refresh
            </button>
            <button type="button" className="workspace-panel__btn" onClick={openExternal} title="Open in new tab">
              Open
            </button>
            <button type="button" className="workspace-panel__btn" onClick={exportActive} title="Download HTML">
              Export
            </button>
            <button
              type="button"
              className="variants-panel__delete"
              onClick={() => void deleteActive()}
              title="Delete variant"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="variants-panel__stage-body">
            {view === "preview" ? (
              <iframe
                key={`${active.id}-${iframeKey}`}
                className="variants-panel__preview"
                title={active.name}
                srcDoc={active.html}
                allow="accelerometer; camera; encrypted-media; geolocation; gyroscope; microphone; midi; clipboard-read; clipboard-write"
              />
            ) : (
              <Suspense fallback={<div className="variants-panel__loading">Loading editor…</div>}>
                <MonacoEditor
                  key={active.id}
                  value={editorValue}
                  language={extToLang(active.name)}
                  theme="playground-dark"
                  onMount={handleEditorMount}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    fontSize: 13,
                    fontFamily: "'Cascadia Code', 'JetBrains Mono', 'Fira Code', monospace",
                    lineNumbers: "on",
                    renderWhitespace: "selection",
                    tabSize: 2,
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    padding: { top: 8 },
                    wordWrap: "on",
                  }}
                />
              </Suspense>
            )}
          </div>

          {/* Iterate */}
          <div className="variants-panel__iterate">
            <input
              className="variants-panel__iterate-input"
              placeholder={`Tweak ${active.name}…`}
              value={iterate}
              onChange={(e) => setIterate(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendIterate();
              }}
            />
            <button
              type="button"
              className="variants-panel__iterate-btn"
              onClick={sendIterate}
              disabled={!iterate.trim() || busy}
            >
              Iterate
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
