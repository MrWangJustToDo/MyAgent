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
import { useCommandOutput } from "../hooks/use-command-output.js";
import { useInputMode } from "../hooks/use-input-mode.js";
import { useLocalChat } from "../hooks/use-local-chat.js";
import { useSelect } from "../hooks/use-select.js";
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
import type { UIMessage } from "ai";

// ============================================================================
// Main Agent Component
// ============================================================================

export const Agent = () => {
  const { exit } = useApp();

  useSize.getActions().useInitTerminalSize();

  useStatic.getActions().useInitStdout();

  const config = useArgs((s) => s.config);

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
  const denyingRef = useRef<{
    id: string;
    isLast: boolean;
    toolCallId?: string;
    toolName?: string;
  } | null>(null);
  const askUserStartTimeRef = useRef<number>(0);

  const isReady = !initLoading;
  const inputActions = useUserInput.getActions();
  const autocompleteActions = useAutocomplete.getActions();
  const isAutocompleteVisible = useAutocomplete((s) => s.visible);
  const selectActions = useSelect.getActions();
  const isSelectVisible = useSelect((s) => s.visible);

  const { mode, denyMode } = useInputMode((s) => ({ mode: s.mode, denyMode: s.denyMode }));
  const modeActions = useInputMode.getActions();

  const pendingApproval = allPendingApproval[0];
  const currentPendingIsLast = allPendingApproval.length === 1;
  const pendingAskUser = allPendingAskUser[0];

  // Keep mode in sync with UI state
  useEffect(() => {
    if (denyMode) {
      modeActions.setMode("freeform");
    } else if (isSelectVisible) {
      modeActions.setMode("select");
    } else if (pendingApproval) {
      modeActions.setMode("approval");
    } else {
      modeActions.setMode("normal");
    }
  }, [denyMode, isSelectVisible, pendingApproval]);

  // Submit answer to a pending ask_user tool call via addToolOutput
  const submitAskUserAnswer = (answer: string) => {
    if (!pendingAskUser) return;
    const durationMs = askUserStartTimeRef.current ? Date.now() - askUserStartTimeRef.current : 0;
    addToolOutput({
      tool: "ask_user",
      toolCallId: pendingAskUser.toolCallId,
      output: {
        question: pendingAskUser.question,
        answer,
        hasOptions: !!pendingAskUser.options?.length,
        message: `User responded: ${answer}`,
        durationMs,
      },
    });
    askUserStartTimeRef.current = 0;
  };

  // ============================================================================
  // Effects
  // ============================================================================

  // Open select list when the current ask_user question changes
  const prevPendingQuestionRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const key = pendingAskUser?.toolCallId;
    if (key && key !== prevPendingQuestionRef.current) {
      prevPendingQuestionRef.current = key;
      askUserStartTimeRef.current = Date.now();
      const hasOptions = pendingAskUser.options && pendingAskUser.options.length > 0;
      if (hasOptions) {
        const opts = pendingAskUser.options!.map((o) => ({ label: o, value: o }));
        opts.push({ label: "Your answer...", value: "__freeform__" });
        selectActions.open(opts, pendingAskUser.multiSelect ?? false, true);
      } else {
        inputActions.clear();
        inputActions.setLoading(false);
        modeActions.setDenyMode(true, "ask_user");
      }
    } else if (!key && prevPendingQuestionRef.current) {
      prevPendingQuestionRef.current = undefined;
      selectActions.close();
    }
  }, [pendingAskUser]);

  useEffect(() => {
    if (isReady && config.initialPrompt && !hasInitRef.current) {
      hasInitRef.current = true;
      sendMessage(config.initialPrompt);
    }
  }, [config.initialPrompt, sendMessage]);

  useEffect(() => {
    inputActions.setLoading(initLoading || isLoading);
  }, [isLoading, initLoading]);

  // ============================================================================
  // Shared Helpers
  // ============================================================================

  const commandCtx: CommandContext = {
    inputActions,
    getInputState: () => useUserInput.getReadonlyState(),
    getAgent: () => toRaw(useAgent.getReactiveState().agent) as CoreAgent,
    setMessages: setMessages as (messages: UIMessage[]) => void,
    exit: () => {
      const agent = useAgent.getReadonlyState().agent;
      if (agent) agentManager.destroyAgent(agent.id);
      exit();
      setTimeout(() => process.exit(0), 200);
    },
  };

  const getAgent = () => toRaw(useAgent.getReactiveState().agent) as CoreAgent | null;

  const acceptAutocomplete = (triggerSubmit: boolean): boolean => {
    if (!isAutocompleteVisible) return false;
    const result = autocompleteActions.accept();
    if (!result) return false;
    inputActions.setValue(result.value);
    if (triggerSubmit && result.type === "execute") {
      setTimeout(() => handleNormalSubmit(), 0);
    }
    return true;
  };

  const handleNormalSubmit = async () => {
    useCommandOutput.getActions().dismiss();
    const { text: prompt, attachments } = inputActions.submit();

    if (prompt.startsWith("/")) {
      if (await dispatchCommand(prompt, commandCtx)) return;
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

  // ============================================================================
  // Global Shortcuts (always active)
  // ============================================================================

  useInput((inputChar, inputKey) => {
    inputActions.addEvent(inputChar, inputKey);

    if (inputKey.ctrl && inputChar === "c") {
      const agent = useAgent.getReadonlyState().agent;
      if (agent) agentManager.destroyAgent(agent.id);
      exit();
      setTimeout(() => process.exit(0), 200);
      return;
    }

    if (inputKey.ctrl && inputChar === "u") {
      inputActions.setValue("");
      return;
    }

    if (inputKey.ctrl && inputChar === "a") {
      if (!isLoading && !pendingApproval) inputActions.setSelectAll(true);
      return;
    }

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

    // Escape: abort agent or dismiss autocomplete (only outside freeform/select modes)
    if (inputKey.escape && mode !== "freeform" && mode !== "select") {
      if (isLoading) {
        stop();
        return;
      }
      if (isAutocompleteVisible) {
        autocompleteActions.dismiss();
      }
      useCommandOutput.getActions().dismiss();
    }
  });

  // ============================================================================
  // Mode: Normal Input
  //   Multi-line editing, cursor movement, history, autocomplete, submit
  // ============================================================================

  useInput(
    (inputChar, inputKey) => {
      if (isLoading) return;

      if (inputKey.tab) {
        acceptAutocomplete(true);
        return;
      }

      if (inputKey.return) {
        if (acceptAutocomplete(true)) return;
        handleNormalSubmit();
        return;
      }

      if (inputKey.delete) {
        inputActions.backspace();
        autocompleteActions.update(useUserInput.getReadonlyState().value);
        return;
      }

      if (inputKey.leftArrow) {
        inputActions.moveCursorLeft();
        return;
      }
      if (inputKey.rightArrow) {
        inputActions.moveCursorRight();
        return;
      }

      if (inputKey.upArrow) {
        if (isAutocompleteVisible) autocompleteActions.selectPrev();
        else inputActions.historyPrev();
        return;
      }
      if (inputKey.downArrow) {
        if (isAutocompleteVisible) autocompleteActions.selectNext();
        else inputActions.historyNext();
        return;
      }

      if (inputChar && !inputKey.ctrl && !inputKey.meta) {
        useCommandOutput.getActions().dismiss();
        inputActions.append(inputChar);
        autocompleteActions.update(useUserInput.getReadonlyState().value);
      }
    },
    { isActive: mode === "normal" }
  );

  // ============================================================================
  // Mode: Tool Approval
  //   Empty input: y → approve, n → enter deny-reason (freeform) mode
  //   Non-empty input: slash commands with autocomplete
  // ============================================================================

  useInput(
    (inputChar, inputKey) => {
      const currentValue = useUserInput.getReadonlyState().value;

      if (!currentValue) {
        const char = inputChar?.toLowerCase();
        if (char === "y") {
          const agentLog = toRaw(getAgent()?.getLog()) as AgentLog | null;
          agentLog?.approval(`user approve ${pendingApproval!.id}`);
          addToolApprovalResponse({ id: pendingApproval!.id, approved: true });
          return;
        }
        if (char === "n") {
          denyingRef.current = {
            id: pendingApproval!.id,
            isLast: currentPendingIsLast,
            toolCallId: pendingApproval!.toolCallId,
            toolName: pendingApproval!.toolName,
          };
          inputActions.clear();
          inputActions.setLoading(false);
          modeActions.setDenyMode(true, "deny");
          return;
        }
      }

      if (inputKey.tab && isAutocompleteVisible) {
        acceptAutocomplete(false);
        return;
      }
      if (inputKey.upArrow && isAutocompleteVisible) {
        autocompleteActions.selectPrev();
        return;
      }
      if (inputKey.downArrow && isAutocompleteVisible) {
        autocompleteActions.selectNext();
        return;
      }

      if (inputKey.return) {
        if (acceptAutocomplete(false)) return;
        const { text: input } = inputActions.submit();
        if (input.startsWith("/")) {
          dispatchCommand(input, commandCtx).then((handled) => {
            if (!handled) inputActions.setInputError(`Unknown command: ${input.split(" ")[0]}`);
          });
        }
        return;
      }

      if (inputKey.delete) {
        inputActions.backspace();
        autocompleteActions.update(useUserInput.getReadonlyState().value);
        return;
      }
      if (inputKey.leftArrow) {
        inputActions.moveCursorLeft();
        return;
      }
      if (inputKey.rightArrow) {
        inputActions.moveCursorRight();
        return;
      }
      if (inputChar && !inputKey.ctrl && !inputKey.meta) {
        inputActions.append(inputChar);
        autocompleteActions.update(useUserInput.getReadonlyState().value);
      }
    },
    { isActive: mode === "approval" }
  );

  // ============================================================================
  // Mode: Ask User Select
  //   Arrow keys navigate, Space toggles (multi-select), Enter submits
  //   "Your answer..." switches to freeform mode
  // ============================================================================

  useInput(
    (inputChar, inputKey) => {
      if (inputKey.upArrow) {
        selectActions.selectPrev();
        return;
      }
      if (inputKey.downArrow) {
        selectActions.selectNext();
        return;
      }
      if (inputChar === " ") {
        selectActions.toggle();
        return;
      }
      if (inputKey.return) {
        if (!pendingAskUser) return;
        if (selectActions.isFreeformSelected()) {
          selectActions.close();
          inputActions.clear();
          inputActions.setLoading(false);
          modeActions.setDenyMode(true, "ask_user");
        } else {
          const result = selectActions.getResult();
          selectActions.close();
          submitAskUserAnswer(result);
        }
        return;
      }
      if (inputKey.escape) {
        selectActions.close();
      }
    },
    { isActive: mode === "select" }
  );

  // ============================================================================
  // Mode: Freeform Text
  //   Simple text input for deny reason or ask_user "Your answer..."
  //   Escape goes back (to select for ask_user, or cancels deny)
  // ============================================================================

  useInput(
    (inputChar, inputKey) => {
      if (inputKey.escape) {
        inputActions.clear();
        modeActions.setDenyMode(false);
        if (denyingRef.current) {
          denyingRef.current = null;
        }
        if (pendingAskUser) {
          const opts = (pendingAskUser.options ?? []).map((o) => ({ label: o, value: o }));
          opts.push({ label: "Your answer...", value: "__freeform__" });
          selectActions.open(opts, pendingAskUser.multiSelect ?? false, true);
        }
        return;
      }

      if (inputKey.return) {
        const { text } = inputActions.submit();

        // Ask_user freeform answer
        if (pendingAskUser) {
          if (!text) return;
          selectActions.close();
          modeActions.setDenyMode(false);
          submitAskUserAnswer(text);
          return;
        }

        // Tool approval deny reason
        if (denyingRef.current) {
          const info = denyingRef.current;
          denyingRef.current = null;
          modeActions.setDenyMode(false);
          const agentLog = toRaw(getAgent()?.getLog()) as AgentLog | null;
          agentLog?.approval(`user denying ${info.id}: ${text || "(no reason)"}`);
          addToolApprovalResponse({
            id: info.id,
            approved: false,
            reason: text || "User denied this tool execution. Do not assume the action was performed.",
            isLast: info.isLast,
            toolCallId: info.toolCallId,
            toolName: info.toolName,
          });
        }
        return;
      }

      if (inputKey.delete) {
        inputActions.backspace();
        return;
      }
      if (inputKey.leftArrow) {
        inputActions.moveCursorLeft();
        return;
      }
      if (inputKey.rightArrow) {
        inputActions.moveCursorRight();
        return;
      }
      if (inputChar && !inputKey.ctrl && !inputKey.meta) {
        inputActions.append(inputChar);
      }
    },
    { isActive: mode === "freeform" }
  );

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
