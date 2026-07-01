import { getEnv } from "@my-agent/core";
import { Box, Text } from "ink";

import { AutocompleteList } from "../components/AutocompleteList.js";
import { CommandOutput } from "../components/CommandOutput.js";
import { FullBox } from "../components/FullBox.js";
import { HalfLinePaddedBox } from "../components/HalfLinePaddedBox.js";
import { LLMUsage } from "../components/LLMUsage.js";
import { Notification } from "../components/Notification.js";
import { SelectList } from "../components/SelectList.js";
import { Spinner } from "../components/Spinner.js";
import { UserInput } from "../components/UserInput.js";
import { useAgentContext } from "../hooks/use-agent-context.js";
import { useAgent } from "../hooks/use-agent.js";
import { useChatStatus } from "../hooks/use-chat-status.js";
import { useConfig } from "../hooks/use-config.js";
import { useInputMode } from "../hooks/use-input-mode.js";
import { useSelect } from "../hooks/use-select.js";

import type { Agent, AgentStatus } from "@my-agent/core";

const INPUT_BG = "#333333";

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

export const Footer = () => {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const _status = useAgent((s) => s.agent?.status || "idle");

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const allMcp = useAgent((s) => s.agent?.mcpManager?.getConnectedServers());

  let status = _status as AgentStatus;

  const { chatStatus, hasPendingAskUser } = useChatStatus((s) => ({
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

      {/* Command output panel (e.g. /help, /mcp) */}
      <CommandOutput />

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
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const _error = useAgent((s) => (s.agent as Agent)?.error || "");
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const lastRunDurationMs = useAgent((s) => (s.agent as Agent)?.lastStreamDurationMs || 0);

  const chatError = useChatStatus((s) => s.error);

  const error = _error || chatError?.name;

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
        {status === "completed" && (
          <Text color="green">
            {`Completed${lastRunDurationMs > 0 ? ` in ${formatDuration(lastRunDurationMs)}` : ""}`}
          </Text>
        )}
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
        {status === "error" && <Text color="red">{error}</Text>}

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
        <Notification />
      </Box>
    </Box>
  );
};

/**
 * Bottom status bar — shows workspace, sandbox, model info.
 */
const StatusBar = ({ mcpCount }: { mcpCount: number }) => {
  const model = useConfig((s) => s.config.model);
  const rootPath = getEnv().rootPath;
  const shortPath = rootPath ? (rootPath.length > 30 ? `...${rootPath.slice(-27)}` : rootPath) : "";

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const version = useAgentContext((s) => s.version);

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
        {mcpCount > 0 && (
          <Text color="blue" dimColor wrap="truncate">
            MCP: {mcpCount}
          </Text>
        )}
      </Box>

      <Box gap={2} flexShrink={0}>
        <LLMUsage key={version} />
        {model && (
          <Text color="gray" dimColor wrap="truncate">
            /{model}
          </Text>
        )}
      </Box>
    </Box>
  );
};
