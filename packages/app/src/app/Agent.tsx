import { Box, Text } from "ink";

import { FullBox } from "../components/FullBox.js";
import { MessageList } from "../components/MessageList.js";
import { Spinner } from "../components/Spinner.js";
import { SubagentPanel } from "../components/SubagentPanel.js";
import { WorkspacePanel } from "../components/WorkspacePanel.js";
import { useAdapter } from "../context/adapter-context.js";
import { useAgentChat } from "../hooks/use-agent-chat.js";
import { useAgentInputControls } from "../hooks/use-agent-input-controls.js";
import { useConfig } from "../hooks/use-config.js";
import { useSize } from "../hooks/use-size.js";
import { useStatic } from "../hooks/use-static.js";
import { useSubagentPanel } from "../hooks/use-subagent-panel.js";
import { useWorkspaceView } from "../hooks/use-workspace-view.js";
import { Content } from "../layout/Content.js";
import { Footer } from "../layout/Footer.js";
import { Header } from "../layout/Header.js";
import { COLORS } from "../theme/colors.js";

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
    isReady,
    status,
    stop,
    addToolApprovalResponse,
    addToolOutput,
    setClientToolWaiting,
    initError,
    initLoading,
    allPendingApproval,
    allPendingAskUser,
    setMessages,
    saveSessionFromChat,
  } = useAgentChat(config);
  const subagentPanelView = useSubagentPanel((s) => s.view);
  const subagentPanelOpen = subagentPanelView !== "closed";
  const workspaceView = useWorkspaceView((s) => s.view);
  const workspaceOpen = workspaceView === "workspace";

  useAgentInputControls({
    adapter,
    initialPrompt: config.initialPrompt,
    isReady,
    isLoading,
    initLoading,
    messages,
    sendMessage,
    stop,
    addToolApprovalResponse,
    addToolOutput,
    setClientToolWaiting,
    allPendingApproval,
    allPendingAskUser,
    setMessages,
    saveSessionFromChat,
  });

  // ============================================================================
  // Render
  // ============================================================================

  if (initError) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color={COLORS.danger} bold>
          Initialization Error:
        </Text>
        <Text color={COLORS.danger}>{initError.message}</Text>
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
      {workspaceOpen ? (
        <Box flexGrow={1} flexDirection="column">
          <WorkspacePanel />
        </Box>
      ) : subagentPanelOpen ? (
        <SubagentPanel />
      ) : (
        <>
          <MessageList messages={messages} />
          <Content />
          <Footer status={status} />
        </>
      )}
    </FullBox>
  );
};
