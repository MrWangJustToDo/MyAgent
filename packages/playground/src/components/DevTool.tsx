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

function patchCreateElement(): () => void {
  const orig = document.createElement.bind(document);
  (document as any).createElement = (tagName: string, options?: ElementCreationOptions) => {
    const el = orig(tagName, options);
    if (tagName.toLowerCase() === "iframe") {
      el.setAttribute("credentialless", "");
    }
    return el;
  };
  return () => {
    (document as any).createElement = orig;
  };
}

async function initDevTool(): Promise<void> {
  const api = getDevToolAPI();
  if (typeof api === "function") {
    const unpatch = patchCreateElement();
    // 打包后函数变成了同步，额外使用setTimeout来模拟异步
    api(DEVTOOL_URL);
    await new Promise((resolve) => setTimeout(resolve, 5000));
    unpatch();
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
