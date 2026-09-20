import { useAgent } from "@codent/app";
import { isActiveStatus } from "@codent/core";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EDITOR_OPTIONS, definePlaygroundTheme } from "../editor/monaco-theme.js";
import { useShellState } from "../hooks/use-shell-state.js";
import { useVariants } from "../hooks/use-variants.js";
import { Button } from "../ui/Button.js";
import { cx } from "../ui/cx.js";
import { Field, Segmented } from "../ui/Field.js";
import {
  IconCode,
  IconDownload,
  IconExternal,
  IconEye,
  IconGrid,
  IconRefresh,
  IconSparkle,
  IconTrash,
} from "../ui/icons.js";
import { State } from "../ui/State.js";
import { getBootedWebContainer } from "../webcontainer/create-env.js";
import { scanVariants } from "../webcontainer/scan-variants.js";

import type { OnMount } from "@monaco-editor/react";

const MonacoEditor = lazy(() => import("@monaco-editor/react").then((m) => ({ default: m.Editor })));

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
 * Variant exploration: generate N self-contained HTML variants through the agent,
 * then compare them side by side or inspect one in the stage.
 *
 * Comparison is the point of this panel, so the grid is a first-class mode rather
 * than a list of thumbnails above a single preview.
 */
export const VariantsPanel = () => {
  const session = useAgent((s) => s.session);

  const variants = useVariants((s) => s.variants);
  const activeVariantId = useVariants((s) => s.activeVariantId);
  const { setVariants, setActive } = useVariants.getActions();

  const compare = useShellState((s) => s.variantsCompare);
  const { setVariantsCompare, showToast } = useShellState.getActions();

  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(2);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [scanning, setScanning] = useState(true);

  const [view, setView] = useState<"preview" | "code">("preview");
  const [iterate, setIterate] = useState("");
  const [iframeKey, setIframeKey] = useState(0);

  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  const active = useMemo(() => variants.find((v) => v.id === activeVariantId) ?? null, [variants, activeVariantId]);

  // Agent busy state drives the iterate affordance.
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
    if (!wc) {
      setScanning(false);
      return;
    }
    setScanning(true);
    try {
      setVariants(await scanVariants(wc.fs, "/"));
    } finally {
      setScanning(false);
    }
  }, [setVariants]);

  // Discover variants whenever the agent mutates the workspace, plus once on mount.
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

  // The WebContainer may not be booted yet when this panel first mounts.
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

  const deleteVariant = useCallback(
    async (id: string) => {
      const wc = getBootedWebContainer();
      if (!wc) return;
      await wc.fs.rm(id, { force: true }).catch(() => {});
      window.dispatchEvent(new CustomEvent("agent:action"));
      await rescan();
      showToast(`Deleted ${id.split("/").pop() ?? id}`);
    },
    [rescan, showToast]
  );

  const exportVariant = useCallback((id: string, html: string) => {
    downloadText(id.split("/").pop() ?? "variant.html", html);
  }, []);

  const openExternal = useCallback((html: string) => {
    const blob = new Blob([html], { type: "text/html" });
    window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
  }, []);

  const sendIterate = useCallback(() => {
    if (!session || !active || !iterate.trim() || busy) return;
    const message =
      `Update the UI variant at ${active.id} per this request: ${iterate.trim()}. ` +
      `Rewrite the file in place as a single self-contained HTML file (inline CSS/JS only). ` +
      `Do not create new files; keep the filename ${active.name}.`;
    setIterate("");
    void session.dispatch({ type: "send", content: message });
  }, [session, active, iterate, busy]);

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    definePlaygroundTheme(monaco);
  }, []);

  const disabledReason = !session ? "Agent is still booting…" : !prompt.trim() ? "Describe a UI to generate." : "";

  return (
    <div className="variants">
      <div className="variants__composer">
        <div className="variants__composer-head">
          <span className="variants__composer-title">
            <IconSparkle size={13} />
            Generate variants
          </span>
          {variants.length > 0 && (
            <Segmented
              label="Variant layout"
              size="sm"
              options={[
                { value: "stage", label: "Stage", icon: <IconEye size={12} /> },
                { value: "compare", label: "Compare", icon: <IconGrid size={12} /> },
              ]}
              value={compare ? "compare" : "stage"}
              onChange={(v) => setVariantsCompare(v === "compare")}
            />
          )}
        </div>

        <textarea
          className="variants__input"
          placeholder="Describe the UI you want to build…"
          value={prompt}
          rows={2}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") generate();
          }}
        />

        <div className="variants__composer-row">
          <Field label="Variants" inline>
            <Segmented
              label="Number of variants"
              size="sm"
              options={[
                { value: "1", label: "1" },
                { value: "2", label: "2" },
                { value: "3", label: "3" },
                { value: "4", label: "4" },
              ]}
              value={String(count)}
              onChange={(v) => setCount(Number(v))}
            />
          </Field>

          <Button
            variant="primary"
            icon={<IconSparkle size={13} />}
            disabled={!session || !prompt.trim() || generating}
            onClick={generate}
          >
            {generating ? "Generating…" : "Generate"}
          </Button>
        </div>

        {disabledReason && <p className="variants__hint">{disabledReason}</p>}
      </div>

      {scanning && variants.length === 0 ? (
        <State loading title="Looking for variants" hint="Scanning the workspace for top-level HTML files…" />
      ) : variants.length === 0 ? (
        <State
          icon={<IconGrid size={19} />}
          title="No variants yet"
          hint="Describe a UI above. Each variant lands as a self-contained HTML file at the workspace root and appears here automatically."
        />
      ) : compare ? (
        <div className="variants__grid" role="list">
          {variants.map((v) => (
            <div
              key={v.id}
              role="listitem"
              className={cx("variant-card", v.id === activeVariantId && "variant-card--active")}
            >
              <div className="variant-card__head">
                <span className="variant-card__name truncate" title={v.id}>
                  {v.name}
                </span>
                <div className="variant-card__actions">
                  <Button
                    size="sm"
                    variant="ghost"
                    iconOnly
                    icon={<IconExternal size={12} />}
                    aria-label={`Open ${v.name} in a new tab`}
                    onClick={() => openExternal(v.html)}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    iconOnly
                    icon={<IconDownload size={12} />}
                    aria-label={`Download ${v.name}`}
                    onClick={() => exportVariant(v.id, v.html)}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    iconOnly
                    icon={<IconEye size={12} />}
                    aria-label={`Inspect ${v.name}`}
                    onClick={() => {
                      setActive(v.id);
                      setVariantsCompare(false);
                    }}
                  />
                </div>
              </div>
              <iframe
                className="variant-card__frame"
                title={v.name}
                srcDoc={v.html}
                sandbox=""
                loading="lazy"
                tabIndex={-1}
                aria-hidden="true"
              />
            </div>
          ))}
        </div>
      ) : active ? (
        <div className="variants__stage">
          <div className="variants__stage-bar">
            <Segmented
              label="Variant view"
              size="sm"
              options={[
                { value: "preview", label: "Preview", icon: <IconEye size={12} /> },
                { value: "code", label: "Code", icon: <IconCode size={12} /> },
              ]}
              value={view}
              onChange={(v) => setView(v)}
            />
            <span className="variants__stage-name truncate" title={active.id}>
              {active.name}
            </span>
            <div className="variants__stage-spacer" />
            <Button
              size="sm"
              variant="ghost"
              iconOnly
              icon={<IconRefresh size={13} />}
              aria-label="Reload preview"
              onClick={() => setIframeKey((k) => k + 1)}
            />
            <Button
              size="sm"
              variant="ghost"
              iconOnly
              icon={<IconExternal size={13} />}
              aria-label="Open variant in a new tab"
              onClick={() => openExternal(active.html)}
            />
            <Button
              size="sm"
              variant="ghost"
              iconOnly
              icon={<IconTrash size={13} />}
              aria-label={`Delete ${active.name}`}
              onClick={() => void deleteVariant(active.id)}
            />
          </div>

          <div className="variants__stage-body">
            {view === "preview" ? (
              <iframe
                key={`${active.id}-${iframeKey}`}
                className="variants__preview"
                title={active.name}
                srcDoc={active.html}
                allow="accelerometer; camera; encrypted-media; geolocation; gyroscope; microphone; midi; clipboard-read; clipboard-write"
              />
            ) : (
              <Suspense fallback={<State loading title="Loading editor" />}>
                <MonacoEditor
                  key={active.id}
                  value={active.html}
                  language="html"
                  theme="playground-dark"
                  onMount={handleEditorMount}
                  options={{ ...EDITOR_OPTIONS, readOnly: true }}
                  loading={<State loading title="Loading editor" />}
                />
              </Suspense>
            )}
          </div>

          <div className="variants__iterate">
            <input
              className="input"
              placeholder={`Tweak ${active.name}…`}
              value={iterate}
              onChange={(e) => setIterate(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendIterate();
              }}
            />
            <Button icon={<IconSparkle size={13} />} disabled={!iterate.trim() || busy} onClick={sendIterate}>
              {busy ? "Agent busy" : "Iterate"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
