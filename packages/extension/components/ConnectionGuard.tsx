import { Button, Input, Spinner } from "@heroui/react";
import { WifiOffIcon, RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { checkServerHealth, useServerConfig } from "@/hooks/useServerConfig";

export const ConnectionGuard = ({ children }: { children: React.ReactNode }) => {
  const connected = useServerConfig((s) => s.connected);
  const connecting = useServerConfig((s) => s.connecting);
  const url = useServerConfig((s) => s.url);
  const actions = useServerConfig.getActions();
  const retryRef = useRef<ReturnType<typeof setTimeout>>(null);
  const [wasConnected, setWasConnected] = useState(false);

  const checkConnection = useCallback(async () => {
    actions.setConnecting(true);
    const health = await checkServerHealth(url);
    if (health && health.status === "ready") {
      actions.setConnected(true);
      actions.setModel(health.model ?? "");
      actions.setProvider(health.provider ?? "");
      setWasConnected(true);
    } else {
      actions.setConnected(false);
    }
    actions.setConnecting(false);
  }, [url]);

  useEffect(() => {
    checkConnection();
    retryRef.current = setInterval(checkConnection, 10000);
    return () => {
      if (retryRef.current) clearInterval(retryRef.current);
    };
  }, [checkConnection]);

  if (connected) {
    return <>{children}</>;
  }

  if (wasConnected && !connected) {
    return (
      <div className="flex h-full flex-col">
        <div className="bg-warning-50 text-warning-700 flex items-center justify-center gap-2 px-3 py-2 text-xs">
          <Spinner size="sm" />
          <span>Reconnecting to server...</span>
          <Button size="sm" variant="light" onPress={checkConnection} className="h-5 min-w-0 text-xs">
            Retry now
          </Button>
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
      <WifiOffIcon className="text-default-400 h-12 w-12" />
      <h2 className="text-lg font-semibold">Not Connected</h2>
      <p className="text-default-500 text-center text-sm">
        Cannot reach the agent server. Make sure it&apos;s running.
      </p>
      <Input
        label="Server URL"
        size="sm"
        value={url}
        onChange={(e) => actions.setUrl(e.target.value)}
        className="max-w-xs"
      />
      <Button
        size="sm"
        color="primary"
        startContent={connecting ? <Spinner size="sm" /> : <RefreshCwIcon className="h-4 w-4" />}
        onPress={checkConnection}
        isDisabled={connecting}
      >
        {connecting ? "Connecting..." : "Retry"}
      </Button>
      <p className="text-default-400 text-xs">
        Start the server with: <code className="bg-default-100 rounded px-1">pnpm start:server</code>
      </p>
    </div>
  );
};
