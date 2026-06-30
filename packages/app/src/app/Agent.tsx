import { Box, Text } from "ink";

import { FullBox } from "../components/FullBox.js";
import { MessageList } from "../components/MessageList.js";
import { Spinner } from "../components/Spinner.js";
import { useAdapter } from "../context/adapter-context.js";
import { useAgentChat } from "../hooks/use-agent-chat.js";
import { useAgentInputControls } from "../hooks/use-agent-input-controls.js";
import { useConfig } from "../hooks/use-config.js";
import { useSize } from "../hooks/use-size.js";
import { useStatic } from "../hooks/use-static.js";
import { Content } from "../layout/Content.js";
import { Footer } from "../layout/Footer.js";
import { Header } from "../layout/Header.js";

import type { AppConfig } from "../adapter/types.js";

// ============================================================================
// Main Agent Component
// ============================================================================

export const Agent = () => {
  const adapter = useAdapter();

  useSize.getActions().useInitTerminalSize();

  useStatic.getActions().useInitStdout();

  // The config store wraps state as DeepReadonly; downstream consumers
  // (useAgentChat → adapter.initialize → createAgentFromConfig) treat it as a
  // mutable AppConfig. The store is the single owner, so a cast is safe here.
  const config = useConfig((s) => s.config) as AppConfig;

  const {
    messages,
    sendMessage,
    isLoading,
    stop,
    addToolApprovalResponse,
    addToolOutput,
    initError,
    initLoading,
    allPendingApproval,
    allPendingAskUser,
    setMessages,
  } = useAgentChat(config);

  const isReady = !initLoading;
  useAgentInputControls({
    adapter,
    initialPrompt: config.initialPrompt,
    isReady,
    isLoading,
    initLoading,
    sendMessage,
    stop,
    addToolApprovalResponse,
    addToolOutput,
    allPendingApproval,
    allPendingAskUser,
    setMessages,
  });

  // ============================================================================
  // Render
  // ============================================================================

  if (initError) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red" bold>
          Initialization Error:
        </Text>
        <Text color="red">{initError.message}</Text>
      </Box>
    );
  }

  if (initLoading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Spinner text="Initializing sandbox..." />
      </Box>
    );
  }

  return (
    <FullBox flexDirection="column">
      <Header />
      <MessageList messages={messages} />
      <Content />
      <Footer />
    </FullBox>
  );
};
