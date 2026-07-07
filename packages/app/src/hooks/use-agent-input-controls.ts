import { agentManager } from "@my-agent/core";
import { useEffect, useRef } from "react";
import { toRaw } from "reactivity-store";

import { dispatchCommand } from "../commands";

import { useAgentKeybindings } from "./use-agent-keybindings.js";
import { useAgent } from "./use-agent.js";
import { useAutocomplete } from "./use-autocomplete.js";
import { useCommandOutput } from "./use-command-output.js";
import { useInputMode } from "./use-input-mode.js";
import { useSelect } from "./use-select.js";
import { useUserInput } from "./use-user-input.js";

import type { AgentAdapter } from "../adapter/types.js";
import type { CommandContext } from "../commands";
import type { UseAgentChatReturn } from "./use-agent-chat.js";
import type { DenyingToolInfo } from "./use-agent-keybindings.js";
import type { ManagedAgent } from "@my-agent/core";
import type { UIMessage } from "@tanstack/ai";

interface UseAgentInputControlsOptions {
  adapter: AgentAdapter;
  initialPrompt?: string;
  isReady: boolean;
  isLoading: boolean;
  initLoading: boolean;
  sendMessage: UseAgentChatReturn["sendMessage"];
  stop: UseAgentChatReturn["stop"];
  addToolApprovalResponse: UseAgentChatReturn["addToolApprovalResponse"];
  addToolOutput: UseAgentChatReturn["addToolOutput"];
  allPendingApproval: UseAgentChatReturn["allPendingApproval"];
  allPendingAskUser: UseAgentChatReturn["allPendingAskUser"];
  setMessages: UseAgentChatReturn["setMessages"];
}

export function useAgentInputControls({
  adapter,
  initialPrompt,
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
}: UseAgentInputControlsOptions): void {
  const hasInitRef = useRef(false);
  const denyingRef = useRef<DenyingToolInfo | null>(null);
  const askUserStartTimeRef = useRef<number>(0);
  const prevPendingQuestionRef = useRef<string | undefined>(undefined);

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
  const setLoading = inputActions.setLoading;

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
  }, [denyMode, isSelectVisible, pendingApproval, setMode]);

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
        durationMs,
        cachedOutputPath: null,
      },
    });
    askUserStartTimeRef.current = 0;
  };

  useEffect(() => {
    const key = pendingAskUser?.toolCallId;
    if (key && key !== prevPendingQuestionRef.current) {
      prevPendingQuestionRef.current = key;
      askUserStartTimeRef.current = Date.now();
      const hasOptions = pendingAskUser.options && pendingAskUser.options.length > 0;
      if (hasOptions) {
        const opts = pendingAskUser.options!.map((option) => ({ label: option, value: option }));
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
  }, [inputActions, modeActions, pendingAskUser, selectActions]);

  useEffect(() => {
    if (isReady && initialPrompt && !hasInitRef.current) {
      hasInitRef.current = true;
      sendMessage(initialPrompt);
    }
  }, [isReady, initialPrompt, sendMessage]);

  useEffect(() => {
    setLoading(initLoading || isLoading);
  }, [isLoading, initLoading, setLoading]);

  const commandCtx: CommandContext = {
    inputActions,
    getInputState: () => useUserInput.getReadonlyState(),
    getAgent: () => toRaw(useAgent.getReactiveState().agent) as ManagedAgent,
    setMessages: setMessages as (messages: UIMessage[]) => void,
    exit: () => {
      const agent = useAgent.getReadonlyState().agent;
      if (agent) agentManager.destroyAgent(agent.id);
      adapter.exit();
    },
    adapter,
  };

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
      await sendMessage({ text: prompt, files: attachments });
    } else {
      await sendMessage(prompt);
    }
  };

  useAgentKeybindings({
    adapter,
    mode,
    isLoading,
    isAutocompleteVisible,
    currentPendingIsLast,
    pendingApproval,
    pendingAskUser,
    inputActions,
    autocompleteActions,
    selectActions,
    commandOutputActions,
    modeActions,
    denyingRef,
    commandCtx,
    stop,
    acceptAutocomplete,
    handleNormalSubmit,
    submitAskUserAnswer,
    addToolApprovalResponse,
  });
}
