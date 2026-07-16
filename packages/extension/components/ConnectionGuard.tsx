import { useCallback, useEffect, useRef, useState } from "react";

import { checkServerHealth, useServerConfig } from "@/hooks/useServerConfig";

export const ConnectionGuard = ({ children }: { children: React.ReactNode }) => {
  const connected = useServerConfig((s) => s.connected);
  const connecting = useServerConfig((s) => s.connecting);
  const url = useServerConfig((s) => s.url);
  const actions = useServerConfig.getActions();
  const [wasConnected, setWasConnected] = useState(false);
  const retryRef = useRef<ReturnType<typeof setTimeout>>(null);

  const checkConnection = useCallback(async () => {
    actions.setConnecting(true);
    const health = await checkServerHealth(url);
    if (health && health.status === "ok") {
      actions.setConnected(true);
      actions.setRootPath(health.rootPath ?? "");
      actions.setSandboxEnv(health.sandboxEnv ?? "");
      setWasConnected(true);
    } else {
      actions.setConnected(false);
    }
    actions.setConnecting(false);
  }, [url, actions]);

  useEffect(() => {
    void checkConnection();
    retryRef.current = setInterval(() => void checkConnection(), 10000);
    return () => {
      if (retryRef.current) clearInterval(retryRef.current);
    };
  }, [checkConnection]);

  if (connected) {
    return <>{children}</>;
  }

  if (wasConnected && !connected) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[#1e1e1e] p-6 text-[#d4d4d4]">
        <div className="flex w-full max-w-sm flex-col items-center gap-5">
          <div className="flex h-12 w-12 animate-pulse items-center justify-center rounded-full bg-amber-500/10">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-amber-400"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div className="text-center">
            <h2 className="text-base font-medium text-[#e0e0e0]">Connection Lost</h2>
            <p className="mt-1 text-sm leading-relaxed text-[#888]">
              The server went offline. Auto-retrying every 10s...
            </p>
          </div>
          <button
            onClick={() => void checkConnection()}
            disabled={connecting}
            className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-all outline-none ${
              connecting
                ? "cursor-not-allowed bg-neutral-800 text-neutral-500"
                : "cursor-pointer bg-blue-600 text-white hover:bg-blue-500 active:scale-[0.98] active:bg-blue-700"
            }`}
          >
            {connecting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                Reconnecting...
              </span>
            ) : (
              "Retry Now"
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center bg-[#1e1e1e] p-6 text-[#d4d4d4]">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-b from-[#2a2a2a] to-[#222] shadow-inner shadow-black/50">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-[#999]"
          >
            <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
            <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
            <line x1="6" y1="6" x2="6.01" y2="6" />
            <line x1="6" y1="18" x2="6.01" y2="18" />
          </svg>
        </div>

        <div className="text-center">
          <h2 className="text-[17px] font-semibold text-[#e0e0e0]">Connect to Server</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-[#777]">
            Enter your server URL to start working with My Agent
          </p>
        </div>

        <div className="flex w-full flex-col gap-3">
          <label htmlFor="guard-server-url" className="text-[13px] font-medium text-[#999]">
            Server URL
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-[#555]"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            </div>
            <input
              id="guard-server-url"
              value={url}
              onChange={(e) => actions.setUrl(e.target.value)}
              className="w-full rounded-lg border border-[#333] bg-[#252525] py-2.5 pr-3 pl-9 text-sm text-[#d4d4d4] placeholder-[#555] transition-all outline-none focus:border-blue-500/60 focus:bg-[#2a2a2a] focus:shadow-[0_0_0_1px_rgba(59,130,246,0.2)]"
              placeholder="http://localhost:3100"
            />
          </div>
          <button
            onClick={() => void checkConnection()}
            disabled={connecting}
            className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-all outline-none ${
              connecting
                ? "cursor-not-allowed bg-neutral-800 text-neutral-500"
                : "cursor-pointer bg-blue-600 text-white shadow-sm shadow-blue-600/20 hover:bg-blue-500 active:scale-[0.98] active:bg-blue-700"
            }`}
          >
            {connecting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                Connecting...
              </span>
            ) : (
              "Connect"
            )}
          </button>
        </div>

        <div className="flex w-full items-center gap-3 text-xs text-[#555]">
          <div className="h-px flex-1 bg-[#2a2a2a]" />
          <span>or run locally</span>
          <div className="h-px flex-1 bg-[#2a2a2a]" />
        </div>

        <div className="rounded-lg border border-[#2a2a2a] bg-[#222] px-3 py-2 font-mono text-xs text-[#777]">
          pnpm start:server
        </div>
      </div>
    </div>
  );
};
