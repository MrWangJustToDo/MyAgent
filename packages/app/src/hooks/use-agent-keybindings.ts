import { agentManager } from "@my-agent/core";
import { useInput } from "ink";
import { toRaw } from "reactivity-store";

import { dispatchCommand } from "../commands";

import { useAgent } from "./use-agent.js";
import { useUserInput } from "./use-user-input.js";

import type { AgentAdapter } from "../adapter/types.js";
import type { CommandContext } from "../commands";
import type { UseAgentChatReturn } from "./use-agent-chat.js";
import type { useAutocomplete } from "./use-autocomplete.js";
import type { useCommandOutput } from "./use-command-output.js";
import type { InputMode, useInputMode } from "./use-input-mode.js";
import type { useSelect } from "./use-select.js";
import type { AgentLog, Agent as CoreAgent } from "@my-agent/core";
import type { MutableRefObject } from "react";

export interface DenyingToolInfo {
  id: string;
  isLast: boolean;
  toolCallId?: string;
  toolName?: string;
}

interface UseAgentKeybindingsOptions {
  adapter: AgentAdapter;
  mode: InputMode;
  isLoading: boolean;
  isAutocompleteVisible: boolean;
  currentPendingIsLast: boolean;
  pendingApproval: UseAgentChatReturn["allPendingApproval"][number] | undefined;
  pendingAskUser: UseAgentChatReturn["allPendingAskUser"][number] | undefined;
  inputActions: ReturnType<typeof useUserInput.getActions>;
  autocompleteActions: ReturnType<typeof useAutocomplete.getActions>;
  selectActions: ReturnType<typeof useSelect.getActions>;
  commandOutputActions: ReturnType<typeof useCommandOutput.getActions>;
  modeActions: ReturnType<typeof useInputMode.getActions>;
  denyingRef: MutableRefObject<DenyingToolInfo | null>;
  commandCtx: CommandContext;
  stop: UseAgentChatReturn["stop"];
  acceptAutocomplete: (triggerSubmit: boolean) => boolean;
  handleNormalSubmit: () => void;
  submitAskUserAnswer: (answer: string) => void;
  addToolApprovalResponse: UseAgentChatReturn["addToolApprovalResponse"];
}

export function useAgentKeybindings({
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
}: UseAgentKeybindingsOptions): void {
  const getAgent = () => toRaw(useAgent.getReactiveState().agent) as CoreAgent | null;

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

  useInput(
    (inputChar, inputKey) => {
      if (inputKey.escape) {
        inputActions.clear();
        modeActions.setDenyMode(false);
        if (denyingRef.current) {
          denyingRef.current = null;
        }
        if (pendingAskUser) {
          const opts = (pendingAskUser.options ?? []).map((option) => ({ label: option, value: option }));
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
}
