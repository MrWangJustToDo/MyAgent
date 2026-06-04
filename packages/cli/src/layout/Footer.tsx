import { Box, Text } from "ink";

import { AutocompleteList } from "../components/AutocompleteList.js";
import { ErrorDetail } from "../components/ErrorDetail.js";
import { FullBox } from "../components/FullBox.js";
import { InputError } from "../components/InputError.js";
import { LLMUsage } from "../components/LLMUsage.js";
import { SelectList } from "../components/SelectList.js";
import { Spinner } from "../components/Spinner.js";
import { TodoStats } from "../components/TodoStats.js";
import { UserInput } from "../components/UserInput.js";
import { useAgent } from "../hooks/use-agent.js";
import { useInputMode } from "../hooks/use-input-mode.js";
import { useLocalChatStatus } from "../hooks/use-local-chat-status.js";
import { useSelect } from "../hooks/use-select.js";

import type { AgentStatus } from "@my-agent/core";

export const Footer = () => {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const _status = useAgent((s) => s.agent?.status || "idle");

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const allMcp = useAgent((s) => s.agent?.mcpManager?.getConnectedServers());

  let status = _status as AgentStatus;

  const { chatStatus, hasPendingAskUser } = useLocalChatStatus((s) => ({
    chatStatus: s.state,
    hasPendingAskUser: s.pendingAskUserCount > 0,
  }));

  if (chatStatus === "error") {
    status = "error";
  }

  const { mode, denyMode, freeformContext } = useInputMode((s) => ({
    mode: s.mode,
    denyMode: s.denyMode,
    freeformContext: s.freeformContext,
  }));

  const isMultiSelect = useSelect((s) => s.multiSelect);

  const isPendingApproval = mode === "approval";
  const showFreeformInput = denyMode;
  const showSelectList = mode === "select";
  const freeformLabel = freeformContext === "deny" ? "Deny reason > " : "Answer > ";
  const isInputEnabled =
    mode === "normal"
      ? status === "idle" ||
        status === "completed" ||
        status === "error" ||
        status === "aborted" ||
        status === "waiting"
      : true;

  return (
    <FullBox flexDirection="column" flexGrow={1} flexShrink={0} paddingY={1}>
      {/* Status bar */}
      <Box
        gap={2}
        borderLeft={false}
        borderRight={false}
        borderBottom={false}
        borderTop
        borderTopColor="gray"
        borderStyle="single"
        borderTopDimColor
        width="full"
      >
        {/* Status indicator */}
        <Box flexShrink={0}>
          {status === "running" && !hasPendingAskUser && <Spinner text="Running..." />}
          {status === "thinking" && <Spinner text="Thinking..." />}
          {status === "responding" && <Spinner text="Responding..." />}
          {status === "running" && hasPendingAskUser && (
            <Text color="cyan" bold>
              Waiting for your response
            </Text>
          )}
          {status === "compacting" && <Spinner text="Compacting..." />}
          {status === "completed" && <Text color="green">Completed</Text>}
          {status === "aborted" && (
            <Text color="green" dimColor>
              Aborted
            </Text>
          )}
          {status === "waiting" && (
            <Text color="yellow" bold>
              Waiting for approval
            </Text>
          )}
          {status === "idle" && (
            <Text color="gray" dimColor>
              Ready
            </Text>
          )}
          {status === "error" && <Text color="red">Error</Text>}
        </Box>
        <TodoStats />
      </Box>

      {/* Error message */}
      <ErrorDetail />

      <Box height={1} flexGrow={1} flexShrink={0} />

      {/* Input error (e.g. "No image in clipboard") */}
      {isInputEnabled && <InputError />}

      {/* Select list (ask_user options) */}
      {showSelectList && <SelectList />}

      {/* Autocomplete suggestions (idle typing) */}
      {!showSelectList && isInputEnabled && <AutocompleteList />}

      {/* Input */}
      <Box opaque>
        {showFreeformInput ? (
          <Text color="yellow" bold>
            {freeformLabel}{" "}
          </Text>
        ) : (
          <Text color={isInputEnabled ? "green" : "gray"} bold>
            {">"}{" "}
          </Text>
        )}
        {isInputEnabled && !showSelectList ? (
          <UserInput prefixWidth={showFreeformInput ? freeformLabel.length + 1 : 2} />
        ) : isInputEnabled && showSelectList ? (
          <Text color="gray" dimColor>
            Use arrows to select
          </Text>
        ) : (
          <Text color="gray" dimColor>
            Processing...
          </Text>
        )}
      </Box>
      <Box height={1} flexGrow={1} flexShrink={0} />
      <Box
        gap={2}
        borderTop
        borderLeft={false}
        borderRight={false}
        borderBottom={false}
        borderTopColor="gray"
        borderStyle="single"
        borderTopDimColor
        justifyContent="space-between"
      >
        <Box gap={2} flexShrink={0}>
          <Text color="gray" dimColor wrap="truncate">
            Exit: Ctrl + C
          </Text>
          {status === "running" && mode === "normal" && !hasPendingAskUser && (
            <Text color="yellow" dimColor wrap="truncate">
              Abort: Esc
            </Text>
          )}
          {isPendingApproval && !showFreeformInput && (
            <Text color="yellow" dimColor wrap="truncate">
              y: approve | n: deny
            </Text>
          )}
          {showFreeformInput && (
            <Text color="yellow" dimColor wrap="truncate">
              Submit: Enter | Cancel: Esc
            </Text>
          )}
          {showSelectList && (
            <Text color="cyan" dimColor wrap="truncate">
              {isMultiSelect ? "Up/Down | Space: toggle | Enter: submit" : "Up/Down | Enter: select"}
            </Text>
          )}
        </Box>
        {allMcp && allMcp.length > 0 && (
          <Box flexShrink={0}>
            <Text color="blue" dimColor wrap="truncate">
              MCP: {allMcp.length}
            </Text>
          </Box>
        )}
        <LLMUsage />
      </Box>
    </FullBox>
  );
};
