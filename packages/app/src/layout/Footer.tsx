import { getEnv } from "@my-agent/core";
import { Box, Text } from "ink";

import { AutocompleteList } from "../components/AutocompleteList.js";
import { CommandOutput } from "../components/CommandOutput.js";
import { FullBox } from "../components/FullBox.js";
import { HalfLinePaddedBox } from "../components/HalfLinePaddedBox.js";
import { LLMUsage } from "../components/LLMUsage.js";
import { SelectList } from "../components/SelectList.js";
import { Spinner } from "../components/Spinner.js";
import { UserInput } from "../components/UserInput.js";
import { useAgentUsage } from "../hooks/use-agent-usage.js";
import { useAgent } from "../hooks/use-agent.js";
import { useChatStatus } from "../hooks/use-chat-status.js";
import { useConfig } from "../hooks/use-config.js";
import { useInputMode } from "../hooks/use-input-mode.js";
import { useSelect } from "../hooks/use-select.js";
import { useUserInput } from "../hooks/use-user-input.js";
import { BG, COLORS } from "../theme/colors.js";

import type { ManagedAgent, AgentStatus } from "@my-agent/core";

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

  const { chatStatus, hasPendingAskUser, pendingApprovalCount } = useChatStatus((s) => ({
    chatStatus: s.state,
    hasPendingAskUser: s.pendingAskUserCount > 0,
    pendingApprovalCount: s.pendingApprovalCount,
  }));

  // Prefer core agent status; overlay chat transport state when actively streaming.
  if (chatStatus === "streaming" || chatStatus === "submitted") {
    if (status === "idle" || status === "completed") {
      status = "running";
    }
  } else if (chatStatus === "error" && status !== "aborted") {
    status = "error";
  }

  const { mode, denyMode, freeformContext } = useInputMode((s) => ({
    mode: s.mode,
    denyMode: s.denyMode,
    freeformContext: s.freeformContext,
  }));

  const { isMultiSelect, cursorOnFreeform } = useSelect((s) => {
    const freeformIdx = s.freeformEnabled ? s.options.length - 1 : -1;
    return {
      isMultiSelect: s.multiSelect,
      cursorOnFreeform: freeformIdx !== -1 && s.selectedIndex === freeformIdx,
    };
  });

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
        borderTopColor={BG.border}
        borderStyle="single"
        borderTopDimColor
        width="full"
      />

      {/* Context info bar — above input, no border */}
      <ContextBar
        status={status}
        hasPendingAskUser={hasPendingAskUser}
        pendingApprovalCount={pendingApprovalCount}
        isPendingApproval={isPendingApproval}
        showFreeformInput={showFreeformInput}
        showSelectList={showSelectList}
        isMultiSelect={isMultiSelect}
        cursorOnFreeform={cursorOnFreeform}
      />

      {/* Input */}
      <HalfLinePaddedBox backgroundColor={BG.input}>
        <Box flexDirection="row">
          <Box flexShrink={0}>
            {showFreeformInput ? (
              <Text color={COLORS.warning} bold>
                {" "}
                {freeformLabel}
              </Text>
            ) : (
              <Text color={isInputEnabled ? COLORS.accent : COLORS.muted} bold>
                {" > "}
              </Text>
            )}
          </Box>
          {isInputEnabled && !showSelectList ? (
            <UserInput />
          ) : isInputEnabled && showSelectList ? (
            <Text color={COLORS.muted} dimColor>
              Use arrows to select
            </Text>
          ) : (
            <Text color={COLORS.muted} dimColor>
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
  pendingApprovalCount,
  isPendingApproval,
  showFreeformInput,
  showSelectList,
  isMultiSelect,
  cursorOnFreeform,
}: {
  status: AgentStatus;
  hasPendingAskUser: boolean;
  pendingApprovalCount: number;
  isPendingApproval: boolean;
  showFreeformInput: boolean;
  showSelectList: boolean;
  isMultiSelect: boolean;
  cursorOnFreeform: boolean;
}) => {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const _error = useAgent((s) => (s.agent as ManagedAgent)?.error || "");
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const lastRunDurationMs = useAgent((s) => (s.agent as ManagedAgent)?.lastStreamDurationMs || 0);

  const chatError = useChatStatus((s) => s.error);
  const inputError = useUserInput((s) => s.inputError);
  const inputFeedback = useUserInput((s) => s.inputFeedback);

  const error = _error || chatError?.message || inputError;

  return (
    <Box paddingX={1} gap={2}>
      <Box gap={2} flexShrink={0}>
        {/* Status indicator */}
        {status === "running" && !hasPendingAskUser && <Spinner text="Running..." />}
        {status === "thinking" && <Spinner text="Thinking..." />}
        {status === "responding" && <Spinner text="Responding..." />}
        {status === "running" && hasPendingAskUser && (
          <Text color={COLORS.primary} bold>
            Waiting for your response
          </Text>
        )}
        {status === "compacting" && <Spinner text="Compacting..." />}
        {status === "completed" && (
          <Text color={COLORS.success}>
            {`Completed${lastRunDurationMs > 0 ? ` in ${formatDuration(lastRunDurationMs)}` : ""}`}
          </Text>
        )}
        {status === "aborted" && (
          <Text color={COLORS.muted} dimColor>
            Aborted
          </Text>
        )}
        {status === "waiting" && (
          <Text color={COLORS.warning} bold>
            {pendingApprovalCount > 1
              ? `Waiting for approval (${pendingApprovalCount} tools — press y for each)`
              : "Waiting for approval"}
          </Text>
        )}
        {status === "idle" && (
          <Text color={COLORS.muted} dimColor>
            Ready
          </Text>
        )}
        {status === "error" && <Text color={COLORS.danger}>{error}</Text>}

        {inputFeedback && status !== "error" && (
          <Text
            color={
              inputFeedback.level === "error"
                ? COLORS.danger
                : inputFeedback.level === "success"
                  ? COLORS.success
                  : COLORS.primary
            }
            dimColor={inputFeedback.level === "info"}
          >
            {inputFeedback.message}
          </Text>
        )}

        {/* Contextual shortcuts */}
        {isPendingApproval && !showFreeformInput && (
          <Text color={COLORS.warning} dimColor>
            y: approve | n: deny
          </Text>
        )}
        {showFreeformInput && (
          <Text color={COLORS.warning} dimColor>
            Submit: Enter | Cancel: Esc
          </Text>
        )}
        {showSelectList && (
          <Text color={COLORS.primary} dimColor>
            {isMultiSelect
              ? cursorOnFreeform
                ? "Up/Down | Space: toggle | →: edit answer | Enter: submit"
                : "Up/Down | Space: toggle | Enter: submit"
              : cursorOnFreeform
                ? "Up/Down | →: edit answer | Enter: submit"
                : "Up/Down | Enter: select"}
          </Text>
        )}
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

  const { version } = useAgentUsage();

  return (
    <Box justifyContent="space-between" paddingX={1}>
      <Box gap={2} flexShrink={1}>
        {shortPath && (
          <Box>
            <Text color={COLORS.muted} dimColor wrap="truncate-start">
              {shortPath}
            </Text>
          </Box>
        )}
        {mcpCount > 0 && (
          <Text color={COLORS.accent} dimColor wrap="truncate">
            MCP: {mcpCount}
          </Text>
        )}
      </Box>

      <Box gap={2} flexShrink={0}>
        <LLMUsage key={version} />
        {model && (
          <Text color={COLORS.muted} dimColor wrap="truncate">
            {model}
          </Text>
        )}
      </Box>
    </Box>
  );
};
