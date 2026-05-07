import { Button, Card, CardBody, CardHeader, Chip, Divider, Input, Spinner } from "@heroui/react";
import { BotIcon, ExternalLinkIcon, RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { checkServerHealth, useServerConfig } from "@/hooks/useServerConfig";

function App() {
  const url = useServerConfig((s) => s.url);
  const connected = useServerConfig((s) => s.connected);
  const model = useServerConfig((s) => s.model);
  const provider = useServerConfig((s) => s.provider);
  const actions = useServerConfig.getActions();
  const [checking, setChecking] = useState(false);

  const handleCheck = useCallback(async () => {
    setChecking(true);
    const health = await checkServerHealth(url);
    if (health && health.status === "ready") {
      actions.setConnected(true);
      actions.setModel(health.model ?? "");
      actions.setProvider(health.provider ?? "");
    } else {
      actions.setConnected(false);
      actions.setModel("");
      actions.setProvider("");
    }
    setChecking(false);
  }, [url]);

  useEffect(() => {
    handleCheck();
  }, []);

  const openSidePanel = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.sidePanel.open({ tabId: tab.id });
      window.close();
    }
  };

  return (
    <div className="p-2">
      <Card className="min-w-[300px]" radius="sm">
        <CardHeader className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BotIcon className="text-primary h-5 w-5" />
            <span className="font-semibold">My Agent</span>
          </div>
          <Chip size="sm" variant="dot" color={connected ? "success" : "danger"}>
            {connected ? "Connected" : "Disconnected"}
          </Chip>
        </CardHeader>
        <Divider />
        <CardBody className="gap-3">
          <Input
            label="Server URL"
            size="sm"
            value={url}
            onChange={(e) => actions.setUrl(e.target.value)}
            endContent={
              <button onClick={handleCheck} className="text-default-400 hover:text-default-600">
                {checking ? <Spinner size="sm" /> : <RefreshCwIcon className="h-4 w-4" />}
              </button>
            }
          />
          {connected && (
            <div className="text-default-500 flex flex-col gap-1 text-xs">
              {model && (
                <span>
                  Model: <strong>{model}</strong>
                </span>
              )}
              {provider && (
                <span>
                  Provider: <strong>{provider}</strong>
                </span>
              )}
            </div>
          )}
          <Button
            color="primary"
            size="sm"
            startContent={<ExternalLinkIcon className="h-4 w-4" />}
            onPress={openSidePanel}
            isDisabled={!connected}
          >
            Open Chat
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}

export default App;
