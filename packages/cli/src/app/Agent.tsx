import { Box, Text, useApp, useInput } from "ink";
import { useCallback, useEffect, useRef } from "react";

import { MessageList } from "../components/MessageList.js";
import { Spinner } from "../components/Spinner.js";
import { useArgs } from "../hooks/useArgs.js";
import { useLocalChat } from "../hooks/useLocalChat.js";
import { useSize } from "../hooks/useSize.js";
import { useUserInput } from "../hooks/useUserInput.js";
import { Footer } from "../layout/Footer.js";
import { Header } from "../layout/Header.js";

// ============================================================================
// Main Agent Component
// ============================================================================

export const Agent = () => {
  const { exit } = useApp();
  const { useInitTerminalSize } = useSize.getActions();

  useInitTerminalSize();

  // Get config from useArgs hook
  const config = useArgs((s) => s.config);

  // Use local chat with our config
  const { messages, sendMessage, isLoading, addToolApprovalResponse, initError, initLoading } = useLocalChat({
    model: config.model,
    url: config.url,
    rootPath: config.rootPath,
    systemPrompt: config.systemPrompt,
    maxIterations: config.maxIterations,
  });

  const hasInitRef = useRef(false);

  const isReady = !initLoading;

  // Input state
  const inputActions = useUserInput.getActions();

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
    // Don't handle input while loading
    if (isLoading) return;

    // Exit on Ctrl+C or Escape
    if ((inputKey.ctrl && inputChar === "c") || inputKey.escape) {
      exit();
      return;
    }

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
    <Box flexDirection="column">
      {/* Header */}
      <Header />

      {/* Messages */}
      <Box flexDirection="column" paddingX={1}>
        <MessageList messages={messages} addToolApprovalResponse={addToolApprovalResponse} />
      </Box>

      {/* Input */}
      <Footer />
    </Box>
  );
};
