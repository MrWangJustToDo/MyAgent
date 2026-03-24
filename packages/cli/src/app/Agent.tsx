import { Box, Text, useApp, useInput } from "ink";
import { useCallback, useEffect, useRef } from "react";
import { toRaw } from "reactivity-store";

import { FullBox } from "../components/FullBox.js";
import { MessageList } from "../components/MessageList.js";
import { Spinner } from "../components/Spinner.js";
import { useAgent } from "../hooks/use-agent.js";
import { useArgs } from "../hooks/use-args.js";
import { useLocalChat } from "../hooks/use-local-chat.js";
import { useSize } from "../hooks/use-size.js";
import { useStatic } from "../hooks/use-static.js";
import { useUserInput } from "../hooks/use-user-input.js";
import { Content } from "../layout/Content.js";
import { Footer } from "../layout/Footer.js";
import { Header } from "../layout/Header.js";

import type { AgentLog } from "@my-agent/core";

// ============================================================================
// Main Agent Component
// ============================================================================

export const Agent = () => {
  const { exit } = useApp();

  const { useInitTerminalSize } = useSize.getActions();

  useInitTerminalSize();

  const { useInitStdout } = useStatic.getActions();

  useInitStdout();

  // Get config from useArgs hook
  const config = useArgs((s) => s.config);

  // Use local chat with our config
  const { messages, sendMessage, isLoading, addToolApprovalResponse, initError, initLoading, allPendingApproval } =
    useLocalChat({
      model: config.model,
      url: config.url,
      rootPath: config.rootPath,
      systemPrompt: config.systemPrompt,
      maxIterations: config.maxIterations,
      provider: config.provider,
      apiKey: config.apiKey,
    });

  const hasInitRef = useRef(false);

  const isReady = !initLoading;

  // Input state
  const inputActions = useUserInput.getActions();

  // current pending
  const pendingApproval = allPendingApproval[0];

  // current is last pending
  const currentPendingIsLast = allPendingApproval.length === 1;

  useEffect(() => {
    if (isReady && config.initialPrompt && !hasInitRef.current) {
      hasInitRef.current = true;
      sendMessage(config.initialPrompt);
    }
  }, [config.initialPrompt, sendMessage]);

  // Handle submit
  const handleSubmit = useCallback(async () => {
    const prompt = inputActions.submit();
    if (prompt && isReady && !isLoading) {
      await sendMessage(prompt);
    }
  }, [inputActions, isReady, isLoading, sendMessage]);

  // Handle keyboard input
  useInput((inputChar, inputKey) => {
    // Exit on Ctrl+C or Escape
    if ((inputKey.ctrl && inputChar === "c") || inputKey.escape) {
      exit();
      return;
    }

    // Handle approval responses when there's a pending approval
    if (pendingApproval) {
      const agentLog = toRaw(useAgent.getReactiveState().agent?.getLog()) as AgentLog | null;

      const char = inputChar?.toLowerCase();
      if (char === "y") {
        agentLog?.approval(`user approve ${pendingApproval.id}`);
        addToolApprovalResponse({ id: pendingApproval.id, approved: true });
        return;
      }
      if (char === "n") {
        agentLog?.approval(`user denying ${pendingApproval.id}`);
        addToolApprovalResponse({
          id: pendingApproval.id,
          approved: false,
          reason: "User denied this tool execution. Do not assume the action was performed.",
          isLast: currentPendingIsLast,
          toolCallId: pendingApproval.toolCallId,
          toolName: pendingApproval.toolName,
        });
        return;
      }
      // Ignore other input while waiting for approval
      return;
    }

    // Don't handle regular input while loading
    if (isLoading) return;

    // Submit on Enter
    if (inputKey.return) {
      handleSubmit();
      return;
    }

    // Backspace
    if (inputKey.backspace || inputKey.delete) {
      inputActions.backspace();
      return;
    }

    // History navigation
    if (inputKey.upArrow) {
      inputActions.historyPrev();
      return;
    }
    if (inputKey.downArrow) {
      inputActions.historyNext();
      return;
    }

    // Regular character input
    if (inputChar && !inputKey.ctrl && !inputKey.meta) {
      inputActions.append(inputChar);
    }
  });

  useEffect(() => {
    if (initLoading || isLoading) {
      inputActions.setLoading(true);
    } else {
      inputActions.setLoading(false);
    }
  }, [isLoading, initLoading]);

  // ============================================================================
  // Render
  // ============================================================================

  // Show init error
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

  // Show loading while initializing
  if (initLoading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Spinner text="Initializing sandbox..." />
      </Box>
    );
  }

  return (
    <FullBox flexDirection="column">
      {/* Header */}
      <Header />

      {/* Messages */}
      <MessageList messages={messages} />

      <Content />

      {/* Input */}
      <Footer />
    </FullBox>
  );
};
