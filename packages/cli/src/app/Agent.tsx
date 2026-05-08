import { agentManager } from "@my-agent/core";
import { Box, Text, useApp, useInput } from "ink";
import { useEffect, useRef } from "react";
import { toRaw } from "reactivity-store";

import { dispatchCommand } from "../commands";
import { FullBox } from "../components/FullBox.js";
import { MessageList } from "../components/MessageList.js";
import { Spinner } from "../components/Spinner.js";
import { useAgent } from "../hooks/use-agent.js";
import { useArgs } from "../hooks/use-args.js";
import { useAutocomplete } from "../hooks/use-autocomplete.js";
import { useLocalChat } from "../hooks/use-local-chat.js";
import { useSize } from "../hooks/use-size.js";
import { useStatic } from "../hooks/use-static.js";
import { useUserInput } from "../hooks/use-user-input.js";
import { Content } from "../layout/Content.js";
import { Footer } from "../layout/Footer.js";
import { Header } from "../layout/Header.js";
import { attachmentToFileUIPart } from "../types/attachment.js";
import { readImageFromClipboard } from "../utils/clipboard.js";

import type { CommandContext } from "../commands";
import type { AgentLog, Agent as CoreAgent } from "@my-agent/core";

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
  const {
    messages,
    sendMessage,
    isLoading,
    stop,
    addToolApprovalResponse,
    initError,
    initLoading,
    allPendingApproval,
  } = useLocalChat({
    model: config.model,
    url: config.url,
    rootPath: config.rootPath,
    systemPrompt: config.systemPrompt,
    maxIterations: config.maxIterations,
    provider: config.provider,
    apiKey: config.apiKey,
    mcpConfigPath: config.mcpConfigPath,
    continueSession: config.continueSession,
    resumeSession: config.resumeSession,
  });

  const hasInitRef = useRef(false);

  const isReady = !initLoading;

  // Input state
  const inputActions = useUserInput.getActions();

  // Autocomplete state
  const autocompleteActions = useAutocomplete.getActions();
  const isAutocompleteVisible = useAutocomplete((s) => s.visible);

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

  // Command context for the command system
  const commandCtx: CommandContext = {
    inputActions,
    getInputState: () => useUserInput.getReadonlyState(),
    // will trigger update, change to use `getReactiveState`
    getAgent: () => useAgent.getReactiveState().agent as CoreAgent,
  };

  // Handle submit
  const handleSubmit = async () => {
    const { text: prompt, attachments } = inputActions.submit();

    // Dispatch slash commands via the command registry
    if (prompt.startsWith("/")) {
      if (await dispatchCommand(prompt, commandCtx)) {
        return;
      }
      // Unknown slash command
      inputActions.setInputError(`Unknown command: ${prompt.split(" ")[0]}`);
      return;
    }

    if (!prompt && !attachments.length) return;
    if (!isReady || isLoading) return;

    if (attachments.length > 0) {
      const files = attachments.map((a) => attachmentToFileUIPart(a));
      await sendMessage({ text: prompt, files });
    } else {
      await sendMessage(prompt);
    }
  };

  // Handle keyboard input
  useInput((inputChar, inputKey) => {
    inputActions.addEvent(inputChar, inputKey);

    // Exit on Ctrl+C
    if (inputKey.ctrl && inputChar === "c") {
      const agent = useAgent.getReadonlyState().agent;
      if (agent) {
        agentManager.destroyAgent(agent.id);
      }
      exit();
      // Force exit after ink cleanup — MCP event loop handles may linger
      setTimeout(() => process.exit(0), 200);
      return;
    }

    // clear on Ctrl+U
    if (inputKey.ctrl && inputChar === "u") {
      inputActions.setValue("");
      return;
    }

    // Ctrl+A: select all
    if (inputKey.ctrl && inputChar === "a") {
      if (!isLoading && !pendingApproval) {
        inputActions.setSelectAll(true);
      }
      return;
    }

    // Ctrl+V: paste image from clipboard
    if (inputKey.ctrl && inputChar === "v") {
      if (!isLoading && !pendingApproval) {
        readImageFromClipboard().then((attachment) => {
          if (attachment) {
            inputActions.addAttachment(attachment);
            inputActions.setInputError(null);
          } else {
            inputActions.setInputError("No image found in clipboard");
          }
        });
      }
      return;
    }

    // Escape: abort if running
    if (inputKey.escape) {
      if (isLoading) {
        stop();
        return;
      }
      // Dismiss autocomplete if visible
      if (isAutocompleteVisible) {
        autocompleteActions.dismiss();
        return;
      }
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

    // Tab: accept autocomplete suggestion
    if (inputKey.tab) {
      if (isAutocompleteVisible) {
        const result = autocompleteActions.accept();
        if (result) {
          if (result.type === "execute") {
            inputActions.setValue(result.value);
            // Trigger submit for immediate commands
            setTimeout(() => handleSubmit(), 0);
          } else {
            inputActions.setValue(result.value);
          }
        }
      }
      return;
    }

    // Enter key handling
    if (inputKey.return) {
      // Backslash continuation: if input ends with \, replace it with newline
      const currentValue = useUserInput.getReadonlyState().value;
      if (currentValue.endsWith("\\")) {
        inputActions.backspace(); // remove the trailing \
        inputActions.insertNewline();
        return;
      }

      if (isAutocompleteVisible) {
        const result = autocompleteActions.accept();
        if (result) {
          if (result.type === "execute") {
            inputActions.setValue(result.value);
            // Trigger submit for immediate commands
            setTimeout(() => handleSubmit(), 0);
          } else {
            inputActions.setValue(result.value);
          }
        }
        return;
      }
      handleSubmit();
      return;
    }

    // \n from terminal (iTerm2/Ghostty/WezTerm Shift+Enter) → insert newline
    if (inputChar === "\n") {
      inputActions.insertNewline();
      return;
    }

    // Backspace: delete character before cursor (handles both text and image placeholders)
    if (inputKey.delete) {
      inputActions.backspace();
      const newValue = useUserInput.getReadonlyState().value;
      autocompleteActions.update(newValue);
      return;
    }

    // Left/Right arrows: cursor movement within text
    if (inputKey.leftArrow) {
      inputActions.moveCursorLeft();
      return;
    }
    if (inputKey.rightArrow) {
      inputActions.moveCursorRight();
      return;
    }

    // Arrow Up: multi-line cursor > autocomplete > history
    if (inputKey.upArrow) {
      if (isAutocompleteVisible) {
        autocompleteActions.selectPrev();
      } else if (inputActions.moveCursorUp()) {
        // Cursor moved up within multi-line text
      } else {
        inputActions.historyPrev();
      }
      return;
    }

    // Arrow Down: multi-line cursor > autocomplete > history
    if (inputKey.downArrow) {
      if (isAutocompleteVisible) {
        autocompleteActions.selectNext();
      } else if (inputActions.moveCursorDown()) {
        // Cursor moved down within multi-line text
      } else {
        inputActions.historyNext();
      }
      return;
    }

    // Regular character input
    if (inputChar && !inputKey.ctrl && !inputKey.meta) {
      inputActions.append(inputChar);
      const newValue = useUserInput.getReadonlyState().value;
      autocompleteActions.update(newValue);
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
