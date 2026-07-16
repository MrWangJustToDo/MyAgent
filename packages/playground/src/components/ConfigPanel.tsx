import { useState } from "react";

import { usePlaygroundConfig } from "../hooks/use-playground-config.js";

import type { ModelStyle } from "@my-agent/core";

export const ConfigPanel = () => {
  const model = usePlaygroundConfig((s) => s.model);
  const style = usePlaygroundConfig((s) => s.style);
  const baseURL = usePlaygroundConfig((s) => s.baseURL);
  const apiKey = usePlaygroundConfig((s) => s.apiKey);
  const fetchProxyUrl = usePlaygroundConfig((s) => s.fetchProxyUrl);
  const { setConfig } = usePlaygroundConfig.getActions();

  const [open, setOpen] = useState(() => !apiKey);
  const [draft, setDraft] = useState({ model, style, baseURL, apiKey, fetchProxyUrl });

  if (!open) {
    return (
      <button type="button" className="config-toggle" onClick={() => setOpen(true)}>
        Settings
      </button>
    );
  }

  return (
    <div className="config-panel">
      <div className="config-panel__header">
        <strong>Playground settings</strong>
        <button type="button" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <label>
        Model
        <input value={draft.model} onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))} />
      </label>
      <label>
        Style
        <select value={draft.style} onChange={(e) => setDraft((d) => ({ ...d, style: e.target.value as ModelStyle }))}>
          <option value="openai">openai</option>
          <option value="anthropic">anthropic</option>
        </select>
      </label>
      <label>
        Base URL
        <input value={draft.baseURL} onChange={(e) => setDraft((d) => ({ ...d, baseURL: e.target.value }))} />
      </label>
      <label>
        API key
        <input
          type="password"
          value={draft.apiKey}
          onChange={(e) => setDraft((d) => ({ ...d, apiKey: e.target.value }))}
          placeholder="stored in localStorage"
        />
      </label>
      <label>
        Fetch proxy URL
        <input
          value={draft.fetchProxyUrl}
          onChange={(e) => setDraft((d) => ({ ...d, fetchProxyUrl: e.target.value }))}
          placeholder="https://….workers.dev (required on GitHub Pages)"
        />
      </label>
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
      <p className="config-panel__hint">
        WebContainer cannot bypass CORS for webfetch/websearch. Locally Vite proxies at <code>/__fetch_proxy</code>. On
        GitHub Pages, deploy <code>packages/playground/workers/fetch-proxy</code> and paste the Worker URL here.
      </p>
    </div>
  );
};
