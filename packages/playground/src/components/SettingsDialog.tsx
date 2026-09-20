import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { usePlaygroundConfig } from "../hooks/use-playground-config.js";
import { useShellState } from "../hooks/use-shell-state.js";
import { Button } from "../ui/Button.js";
import { Dialog } from "../ui/Dialog.js";
import { Field, Input, Select, Switch } from "../ui/Field.js";
import { IconDownload, IconSettings } from "../ui/icons.js";

import type { PlaygroundConfig } from "../hooks/use-playground-config.js";
import type { ModelStyle } from "@codent/core";

const STYLE_OPTIONS: { value: ModelStyle; label: string }[] = [
  { value: "openai", label: "OpenAI-compatible" },
  { value: "anthropic", label: "Anthropic" },
];

type Draft = Pick<PlaygroundConfig, "model" | "style" | "baseURL" | "apiKey" | "providerServerUrl" | "fetchProxyUrl">;

const draftFrom = (config: PlaygroundConfig): Draft => ({
  model: config.model,
  style: config.style,
  baseURL: config.baseURL,
  apiKey: config.apiKey,
  providerServerUrl: config.providerServerUrl,
  fetchProxyUrl: config.fetchProxyUrl,
});

/**
 * Settings surface. Replaces the former draggable floating bubble: the same
 * fields, reachable from the top bar, `Cmd/Ctrl+,` and the command palette, with
 * explicit dirty tracking so "Save & restart" is only meaningful when it changes
 * something.
 */
export const SettingsDialog = ({ open }: { open: boolean }) => {
  const config = usePlaygroundConfig();
  const { setConfig } = usePlaygroundConfig.getActions();
  const workspaceVisible = usePlaygroundConfig((s) => s.workspaceVisible);
  const { setExportOpen, setSettingsOpen } = useShellState.getActions();

  const [draft, setDraft] = useState<Draft>(() => draftFrom(config));
  const [showKey, setShowKey] = useState(false);
  const [touched, setTouched] = useState(false);

  const close = useCallback(() => setSettingsOpen(false), [setSettingsOpen]);

  // Re-seed the draft each time the dialog opens so a cancelled edit is discarded.
  // `config` is read once per open on purpose: subscribing to it would let a live
  // edit from elsewhere fight the user's in-progress draft.
  const seedRef = useRef(config);
  seedRef.current = config;
  useEffect(() => {
    if (!open) return;
    setDraft(draftFrom(seedRef.current));
    setTouched(false);
    setShowKey(false);
  }, [open]);

  const proxyMode = Boolean(draft.providerServerUrl.trim());
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(draftFrom(config)), [draft, config]);

  const patch = (partial: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...partial }));
    setTouched(true);
  };

  const save = () => {
    setConfig({ ...draft });
    close();
  };

  const modelError = !proxyMode && !draft.model.trim() ? "A model id is required in direct mode." : "";
  const canSave = dirty && !modelError;

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Playground settings"
      description="Model provider, remote planes and workspace"
      leading={
        <span className="dialog__chip" aria-hidden="true">
          <IconSettings size={15} />
        </span>
      }
      footer={
        <>
          <Button
            variant="secondary"
            icon={<IconDownload size={13} />}
            onClick={() => {
              close();
              setExportOpen(true);
            }}
          >
            Export workspace
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setDraft(draftFrom(config));
              setTouched(false);
            }}
            disabled={!dirty}
          >
            Reset
          </Button>
          <Button variant="primary" onClick={save} disabled={!canSave}>
            {dirty ? "Save & restart agent" : "Saved"}
          </Button>
        </>
      }
    >
      <section className="settings__section">
        <div className="settings__section-head">
          <h3>Model provider</h3>
          {proxyMode && <span className="badge badge--accent">Ignored in proxy mode</span>}
        </div>

        <div className={proxyMode ? "settings__grid settings__grid--muted" : "settings__grid"}>
          <Field label="Model" error={modelError}>
            <Input
              value={draft.model}
              disabled={proxyMode}
              placeholder="gpt-4o-mini"
              spellCheck={false}
              onChange={(e) => patch({ model: e.target.value })}
            />
          </Field>

          <Field label="API style" hint="Wire format used by the provider adapter.">
            <Select
              value={draft.style}
              disabled={proxyMode}
              options={STYLE_OPTIONS}
              onChange={(e) => patch({ style: e.target.value as ModelStyle })}
            />
          </Field>

          <Field label="Base URL" hint="Chat Completions or Messages endpoint root.">
            <Input
              value={draft.baseURL}
              disabled={proxyMode}
              placeholder="https://api.openai.com/v1"
              spellCheck={false}
              onChange={(e) => patch({ baseURL: e.target.value })}
            />
          </Field>

          <Field label="API key" hint="Stored in this browser's localStorage.">
            <div className="settings__secret">
              <Input
                type={showKey ? "text" : "password"}
                value={draft.apiKey}
                disabled={proxyMode}
                placeholder="sk-…"
                spellCheck={false}
                autoComplete="off"
                onChange={(e) => patch({ apiKey: e.target.value })}
              />
              <Button variant="ghost" size="sm" onClick={() => setShowKey((v) => !v)} disabled={proxyMode}>
                {showKey ? "Hide" : "Show"}
              </Button>
            </div>
          </Field>
        </div>

        <p className="settings__note">
          In direct mode the browser calls your provider. The key never leaves this tab except to that endpoint.
        </p>
      </section>

      <section className="settings__section">
        <div className="settings__section-head">
          <h3>Remote planes</h3>
          {proxyMode && <span className="badge badge--success">Proxy mode</span>}
        </div>

        <Field
          label="Provider server URL"
          hint="A running @codent/server. It holds the API key; local model, base URL and key are ignored."
        >
          <Input
            value={draft.providerServerUrl}
            placeholder="http://localhost:3100"
            spellCheck={false}
            onChange={(e) => patch({ providerServerUrl: e.target.value })}
          />
        </Field>

        <Field
          label="Fetch proxy URL"
          hint="WebContainer cannot bypass CORS for webfetch/websearch. Leave empty in dev to use Vite's /__fetch_proxy; on GitHub Pages deploy the Cloudflare Worker and paste its URL."
        >
          <Input
            value={draft.fetchProxyUrl}
            placeholder="https://….workers.dev"
            spellCheck={false}
            onChange={(e) => patch({ fetchProxyUrl: e.target.value })}
          />
        </Field>
      </section>

      <section className="settings__section">
        <div className="settings__section-head">
          <h3>Workspace</h3>
        </div>
        <Field label="Show workspace panel" inline>
          <Switch
            checked={workspaceVisible}
            aria-label="Show workspace panel"
            onChange={(checked) => setConfig({ workspaceVisible: checked })}
          />
        </Field>
      </section>

      {touched && !dirty && <p className="settings__note">Changes saved.</p>}
    </Dialog>
  );
};
