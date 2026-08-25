/** Approval mode: y/n quick responses, `/` command entry, autocomplete. */

import { useInput } from "ink";

import { dispatchCommand } from "../../commands";
import { useUserInput } from "../use-user-input.js";

import { handleExtensionConfirmKeys, isAnyPanelOpen } from "./context.js";

import type { KeybindingContext } from "./context.js";

export function useApprovalModeKeybindings(ctx: KeybindingContext): void {
  const {
    inputActions,
    autocompleteActions,
    commandOutputActions,
    modeActions,
    isAutocompleteVisible,
    pendingApproval,
    currentPendingIsLast,
    denyingRef,
    acceptAutocomplete,
    addToolApprovalResponse,
    commandCtx,
  } = ctx;

  useInput(
    (inputChar, inputKey) => {
      if (handleExtensionConfirmKeys(ctx, inputChar, inputKey)) return;
      // Panel open: the panel's own useInput owns the keyboard — never let
      // panel navigation approve/deny a pending tool.
      if (isAnyPanelOpen()) return;
      const currentValue = useUserInput.getReadonlyState().value;

      if (!currentValue) {
        const char = inputChar?.toLowerCase();
        if (char === "y") {
          if (!pendingApproval) return;
          addToolApprovalResponse({ id: pendingApproval.id, approved: true });
          return;
        }
        if (char === "n") {
          if (!pendingApproval) return;
          denyingRef.current = {
            id: pendingApproval.id,
            isLast: currentPendingIsLast,
            toolCallId: pendingApproval.toolCallId,
            toolName: pendingApproval.toolName,
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
      if (inputKey.upArrow) {
        if (isAutocompleteVisible) autocompleteActions.selectPrev();
        else if (commandOutputActions.hasScroll()) commandOutputActions.scrollPrev();
        return;
      }
      if (inputKey.downArrow) {
        if (isAutocompleteVisible) autocompleteActions.selectNext();
        else if (commandOutputActions.hasScroll()) commandOutputActions.scrollNext();
        return;
      }
      if (inputKey.return) {
        // Accept autocomplete first — matching normal mode. If an option was
        // accepted, return here instead of re-submitting its text. "execute"
        // options run immediately; "input" options (command → option list)
        // only switch to the option list, requiring a second Enter to confirm.
        if (acceptAutocomplete(true)) return;
        const { text: input } = inputActions.submit();
        if (input.startsWith("/")) {
          commandOutputActions.dismiss();
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
      // In approval mode, only `/` is accepted as the first character to enter
      // command-selection mode. After that, navigation is via arrow keys / Tab
      // (handled above), so all further character input is blocked.
      if (inputChar && !inputKey.ctrl && !inputKey.meta) {
        if (!currentValue && inputChar === "/") {
          commandOutputActions.dismiss();
          inputActions.append(inputChar);
          autocompleteActions.update(useUserInput.getReadonlyState().value);
        }
      }
    },
    { isActive: ctx.mode === "approval" }
  );
}
