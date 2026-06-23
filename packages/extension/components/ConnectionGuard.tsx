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
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: 24,
          height: "100%",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 16px",
            background: "#fff3cd",
            color: "#856404",
            fontSize: 13,
            borderRadius: 4,
          }}
        >
          <span>Connection to server lost</span>
        </div>
        <p style={{ color: "#888", textAlign: "center", fontSize: 12 }}>
          The agent is paused until the server is back online.
        </p>
        <button
          onClick={() => void checkConnection()}
          disabled={connecting}
          style={{
            padding: "6px 16px",
            background: connecting ? "#ccc" : "#0070f3",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: connecting ? "not-allowed" : "pointer",
            fontSize: 12,
          }}
        >
          {connecting ? "Reconnecting..." : "Retry now"}
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 24,
        height: "100%",
      }}
    >
      <h2 style={{ fontSize: 18, fontWeight: 600 }}>Not Connected</h2>
      <p style={{ color: "#888", textAlign: "center", fontSize: 14 }}>
        Cannot reach the CoreEnv server. Make sure it&apos;s running.
      </p>
      <div>
        <label htmlFor="guard-server-url" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
          Server URL
        </label>
        <input
          id="guard-server-url"
          value={url}
          onChange={(e) => actions.setUrl(e.target.value)}
          style={{ padding: "4px 8px", border: "1px solid #ccc", borderRadius: 4, width: 240 }}
        />
      </div>
      <button
        onClick={() => void checkConnection()}
        disabled={connecting}
        style={{
          padding: "6px 16px",
          background: connecting ? "#ccc" : "#0070f3",
          color: "#fff",
          border: "none",
          borderRadius: 4,
          cursor: connecting ? "not-allowed" : "pointer",
        }}
      >
        {connecting ? "Connecting..." : "Retry"}
      </button>
      <p style={{ color: "#aaa", fontSize: 11 }}>
        Start the server with:{" "}
        <code style={{ background: "#f0f0f0", padding: "1px 4px", borderRadius: 2 }}>pnpm start:server</code>
      </p>
    </div>
  );
};
