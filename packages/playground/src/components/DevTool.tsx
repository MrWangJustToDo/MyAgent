import { useState } from "react";

const DEVTOOL_URL = "https://mrwangjusttodo.github.io/myreact-devtools";

function loadScript(url: string): Promise<void> {
  const script = document.createElement("script");
  return new Promise<undefined>((resolve, reject) => {
    script.src = url;
    script.onload = () => resolve(undefined);
    script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
    document.head.appendChild(script);
  }).finally(() => script.remove());
}

type DevToolAPI = ((src: string) => void) & { close?: () => void };

const getDevToolAPI = (): DevToolAPI | undefined => {
  return (window as any).__MY_REACT_DEVTOOL_IFRAME__ as DevToolAPI | undefined;
};

async function initDevTool(): Promise<void> {
  const api = getDevToolAPI();
  if (typeof api === "function") {
    api(DEVTOOL_URL);
  } else {
    await loadScript(`${DEVTOOL_URL}/bundle/hook.js`);
    await initDevTool();
  }
}

export const DevTool = () => {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);

  if (hidden) return null;

  return (
    <div className="devtool-bar">
      <button
        type="button"
        className="devtool-bar__toggle"
        onClick={async () => {
          if (!open) {
            await initDevTool();
            setOpen(true);
          } else {
            getDevToolAPI()?.close?.();
            setOpen(false);
          }
        }}
      >
        {open ? "Close DevTool" : "Open DevTool"}
      </button>
      <button type="button" className="devtool-bar__close" onClick={() => setHidden(true)} title="Hide DevTool toggle">
        ✕
      </button>
    </div>
  );
};
