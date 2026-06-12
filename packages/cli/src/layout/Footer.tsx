import { Box, Text } from "ink";

import { AutocompleteList } from "../components/AutocompleteList.js";
import { ErrorDetail } from "../components/ErrorDetail.js";
import { FullBox } from "../components/FullBox.js";
import { HalfLinePaddedBox } from "../components/HalfLinePaddedBox.js";
import { LLMUsage } from "../components/LLMUsage.js";
import { Notification } from "../components/Notification.js";
import { SelectList } from "../components/SelectList.js";
import { Spinner } from "../components/Spinner.js";
import { TodoStats } from "../components/TodoStats.js";
import { UserInput } from "../components/UserInput.js";
import { useArgs } from "../hooks";
import { useAgentSandbox } from "../hooks/use-agent-sandbox.js";
import { useAgent } from "../hooks/use-agent.js";
import { useInputMode } from "../hooks/use-input-mode.js";
import { useLocalChatStatus } from "../hooks/use-local-chat-status.js";
import { useSelect } from "../hooks/use-select.js";

import type { AgentStatus } from "@my-agent/core";

const INPUT_BG = "#333333";

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
      <Box
        borderLeft={false}
        borderRight={false}
        borderBottom={false}
        borderTop
        borderTopColor="gray"
        borderStyle="single"
        borderTopDimColor
        width="full"
      />
      {/* Error message */}
      <ErrorDetail />

      {/* Context info bar — above input, no border */}
      <ContextBar
        status={status}
        hasPendingAskUser={hasPendingAskUser}
        isPendingApproval={isPendingApproval}
        showFreeformInput={showFreeformInput}
        showSelectList={showSelectList}
        isMultiSelect={isMultiSelect}
      />

      {/* Input */}
      <HalfLinePaddedBox backgroundColor={INPUT_BG}>
        <Box flexDirection="row">
          <Box flexShrink={0}>
            {showFreeformInput ? (
              <Text color="yellow" bold>
                {" "}
                {freeformLabel}
              </Text>
            ) : (
              <Text color={isInputEnabled ? "green" : "gray"} bold>
                {" > "}
              </Text>
            )}
          </Box>
          {isInputEnabled && !showSelectList ? (
            <UserInput />
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
      </HalfLinePaddedBox>

      {/* Select list (ask_user options) */}
      {showSelectList && <SelectList />}

      {/* Autocomplete suggestions (idle typing) */}
      {!showSelectList && isInputEnabled && <AutocompleteList />}

      {/* Bottom status bar — workspace, sandbox, model */}
      <StatusBar mcpCount={allMcp?.length ?? 0} />
    </FullBox>
  );
};

/**
 * Context info bar above the input — shows status, shortcuts, todos.
 */
const ContextBar = ({
  status,
  hasPendingAskUser,
  isPendingApproval,
  showFreeformInput,
  showSelectList,
  isMultiSelect,
}: {
  status: AgentStatus;
  hasPendingAskUser: boolean;
  isPendingApproval: boolean;
  showFreeformInput: boolean;
  showSelectList: boolean;
  isMultiSelect: boolean;
}) => {
  return (
    <Box paddingX={1} gap={2}>
      <Box gap={2} flexShrink={0}>
        {/* Status indicator */}
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

        {/* Contextual shortcuts */}
        {isPendingApproval && !showFreeformInput && (
          <Text color="yellow" dimColor>
            y: approve | n: deny
          </Text>
        )}
        {showFreeformInput && (
          <Text color="yellow" dimColor>
            Submit: Enter | Cancel: Esc
          </Text>
        )}
        {showSelectList && (
          <Text color="cyan" dimColor>
            {isMultiSelect ? "Up/Down | Space: toggle | Enter: submit" : "Up/Down | Enter: select"}
          </Text>
        )}
      </Box>

      <Box gap={2} flexShrink={0}>
        <TodoStats />
        <Notification />
      </Box>
    </Box>
  );
};

/**
 * Bottom status bar — shows workspace, sandbox, model info.
 */
const StatusBar = ({ mcpCount }: { mcpCount: number }) => {
  const { model, path } = useArgs((s) => ({ model: s.config.model, path: s.config.rootPath }));
  const sandboxName = useAgentSandbox((s) => s.sandbox?.provider);

  const shortPath = path ? (path.length > 30 ? `...${path.slice(-27)}` : path) : "";

  return (
    <Box justifyContent="space-between" paddingX={1}>
      <Box gap={2} flexShrink={1}>
        {shortPath && (
          <Box maxWidth="30%">
            <Text color="gray" dimColor wrap="truncate-start">
              {shortPath}
            </Text>
          </Box>
        )}
        {sandboxName && (
          <Text color="gray" dimColor wrap="truncate">
            {sandboxName}
          </Text>
        )}
        {mcpCount > 0 && (
          <Text color="blue" dimColor wrap="truncate">
            MCP: {mcpCount}
          </Text>
        )}
      </Box>

      <Box gap={2} flexShrink={0}>
        <LLMUsage />
        {model && (
          <Text color="gray" dimColor wrap="truncate">
            /{model}
          </Text>
        )}
      </Box>
    </Box>
  );
};
