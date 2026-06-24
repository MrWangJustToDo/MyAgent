import { agentManager } from "@my-agent/core";
import { Box, Text, useInput } from "ink";
import { useEffect, useRef } from "react";
import { toRaw } from "reactivity-store";

import { dispatchCommand } from "../commands";
import { FullBox } from "../components/FullBox.js";
import { MessageList } from "../components/MessageList.js";
import { Spinner } from "../components/Spinner.js";
import { useAdapter } from "../context/adapter-context.js";
import { useAgentChat } from "../hooks/use-agent-chat.js";
import { useAgent } from "../hooks/use-agent.js";
import { useAutocomplete } from "../hooks/use-autocomplete.js";
import { useCommandOutput } from "../hooks/use-command-output.js";
import { useConfig } from "../hooks/use-config.js";
import { useInputMode } from "../hooks/use-input-mode.js";
import { useSelect } from "../hooks/use-select.js";
import { useSize } from "../hooks/use-size.js";
import { useStatic } from "../hooks/use-static.js";
import { useUserInput } from "../hooks/use-user-input.js";
import { Content } from "../layout/Content.js";
import { Footer } from "../layout/Footer.js";
import { Header } from "../layout/Header.js";
import { attachmentToFileUIPart } from "../types/attachment.js";

import type { CommandContext } from "../commands";
import type { AgentLog, Agent as CoreAgent } from "@my-agent/core";
import type { UIMessage } from "ai";

// ============================================================================
// Main Agent Component
// ============================================================================

export const Agent = () => {
  const adapter = useAdapter();

  useSize.getActions().useInitTerminalSize();

  useStatic.getActions().useInitStdout();

  const config = useConfig((s) => s.config);

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
  const commandOutputActions = useCommandOutput.getActions();

  const { mode, denyMode } = useInputMode((s) => ({ mode: s.mode, denyMode: s.denyMode }));
  const modeActions = useInputMode.getActions();

  const pendingApproval = allPendingApproval[0];
  const currentPendingIsLast = allPendingApproval.length === 1;
  const pendingAskUser = allPendingAskUser[0];

  const setMode = modeActions.setMode;

  useEffect(() => {
    if (denyMode) {
      setMode("freeform");
    } else if (isSelectVisible) {
      setMode("select");
    } else if (pendingApproval) {
      setMode("approval");
    } else {
      setMode("normal");
    }
  }, [denyMode, isSelectVisible, setMode, pendingApproval]);

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
  }, [isReady, config.initialPrompt, sendMessage]);

  const setLoading = inputActions.setLoading;

  useEffect(() => {
    setLoading(initLoading || isLoading);
  }, [isLoading, initLoading, setLoading]);

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
      adapter.exit();
    },
    adapter,
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
    commandOutputActions.dismiss();
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
      adapter.exit();
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
        adapter.readClipboardImage?.().then((result) => {
          if (result) {
            inputActions.addAttachment({
              path: "clipboard",
              filename: `clipboard-${Date.now()}.png`,
              mediaType: result.mediaType,
              type: "image",
              size: Math.ceil((result.data.length * 3) / 4),
              dataUrl: `data:${result.mediaType};base64,${result.data}`,
            });
            inputActions.setInputError(null);
          } else {
            inputActions.setInputError("No image found in clipboard");
          }
        });
      }
      return;
    }

    if (inputKey.escape && mode !== "freeform" && mode !== "select") {
      if (isLoading) {
        stop();
        return;
      }
      if (isAutocompleteVisible) {
        autocompleteActions.dismiss();
      }
      commandOutputActions.dismiss();
    }
  });

  // ============================================================================
  // Mode: Normal Input
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

      if (inputKey.backspace) {
        inputActions.backspace();
        autocompleteActions.update(useUserInput.getReadonlyState().value);
        return;
      }
      if (inputKey.delete) {
        inputActions.deleteForward();
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
        else if (commandOutputActions.hasScroll()) commandOutputActions.scrollPrev();
        else inputActions.historyPrev();
        return;
      }
      if (inputKey.downArrow) {
        if (isAutocompleteVisible) autocompleteActions.selectNext();
        else if (commandOutputActions.hasScroll()) commandOutputActions.scrollNext();
        else inputActions.historyNext();
        return;
      }

      if (inputChar && !inputKey.ctrl && !inputKey.meta) {
        commandOutputActions.dismiss();
        inputActions.append(inputChar);
        autocompleteActions.update(useUserInput.getReadonlyState().value);
      }
    },
    { isActive: mode === "normal" }
  );

  // ============================================================================
  // Mode: Tool Approval
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

      if (inputKey.backspace) {
        inputActions.backspace();
        autocompleteActions.update(useUserInput.getReadonlyState().value);
        return;
      }
      if (inputKey.delete) {
        inputActions.deleteForward();
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

        if (pendingAskUser) {
          if (!text) return;
          selectActions.close();
          modeActions.setDenyMode(false);
          submitAskUserAnswer(text);
          return;
        }

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

      if (inputKey.backspace) {
        inputActions.backspace();
        return;
      }
      if (inputKey.delete) {
        inputActions.deleteForward();
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
