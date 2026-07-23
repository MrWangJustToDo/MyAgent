import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import { toRaw } from "reactivity-store";

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
import { useConfig } from "../hooks/use-config.js";
import { useExtensionUI } from "../hooks/use-extension-ui.js";
import { useInputMode } from "../hooks/use-input-mode.js";
import { useSelect } from "../hooks/use-select.js";
import { useUserInput } from "../hooks/use-user-input.js";
import { BG, COLORS } from "../theme/colors.js";
import { formatDuration } from "../utils/format.js";
import { approvalKeysHint, busyQueueHint, freeformSubmitHint, selectListHint } from "../utils/keyboard-labels.js";

import type { AgentStatus, ManagedAgent, QueuedMessagesSnapshot } from "@my-agent/core";

export const Footer = ({
  status,
  queuedMessages,
}: {
  status: AgentStatus;
  queuedMessages?: QueuedMessagesSnapshot;
}) => {
  const allMcp = useAgent((s) => s.agent?.mcpManager?.getConnectedServers());

  const { mode, denyMode, freeformContext } = useInputMode((s) => ({
    mode: s.mode,
    denyMode: s.denyMode,
    freeformContext: s.freeformContext,
  }));

  const isPendingApproval = mode === "approval";

  const displayStatus: AgentStatus = status;

  const { isMultiSelect, cursorOnFreeform } = useSelect((s) => {
    const freeformIdx = s.freeformEnabled ? s.options.length - 1 : -1;
    return {
      isMultiSelect: s.multiSelect,
      cursorOnFreeform: freeformIdx !== -1 && s.selectedIndex === freeformIdx,
    };
  });

  const showFreeformInput = denyMode;
  const showSelectList = mode === "select";
  const freeformLabel = freeformContext === "deny" ? "Deny reason > " : "Answer > ";
  // Allow typing while the agent runs so users can queue steer / follow-up messages.
  const isInputEnabled = mode === "normal" || mode === "approval" || denyMode || mode === "select";
  const isAgentBusy =
    displayStatus === "running" ||
    displayStatus === "thinking" ||
    displayStatus === "responding" ||
    displayStatus === "compacting";
  const steerCount = queuedMessages?.steer.length ?? 0;
  const followUpCount = queuedMessages?.followUp.length ?? 0;

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
        status={displayStatus}
        isPendingApproval={isPendingApproval}
        showFreeformInput={showFreeformInput}
        showSelectList={showSelectList}
        isMultiSelect={isMultiSelect}
        cursorOnFreeform={cursorOnFreeform}
        isAgentBusy={isAgentBusy}
        steerCount={steerCount}
        followUpCount={followUpCount}
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
              <Text color={COLORS.accent} bold>
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
  isPendingApproval,
  showFreeformInput,
  showSelectList,
  isMultiSelect,
  cursorOnFreeform,
  isAgentBusy,
  steerCount,
  followUpCount,
}: {
  status: AgentStatus;
  isPendingApproval: boolean;
  showFreeformInput: boolean;
  showSelectList: boolean;
  isMultiSelect: boolean;
  cursorOnFreeform: boolean;
  isAgentBusy: boolean;
  steerCount: number;
  followUpCount: number;
}) => {
  // ManagedAgent mutates fields in place; useAgent primitive selectors stay stale.
  // Subscribe to agent state and read duration/error from the live agent ref.
  const agent = useAgent((s) => s.agent) as ManagedAgent | null;
  const [agentTick, setAgentTick] = useState(0);
  useEffect(() => {
    if (!agent) return;
    return toRaw(agent).observe({
      onState: () => setAgentTick((n) => n + 1),
    });
  }, [agent]);
  const lastRunDurationMs = agentTick >= 0 ? agent?.lastStreamDurationMs || 0 : 0;
  const _error = agent?.error || "";

  const inputError = useUserInput((s) => s.inputError);
  const inputFeedback = useUserInput((s) => s.inputFeedback);
  const extStatus = useExtensionUI((s) => s.statusText);

  const error = _error || inputError;

  return (
    <Box paddingX={1} gap={2}>
      <Box gap={2} flexShrink={0}>
        {/* Status indicator */}
        {status === "running" && <Spinner text="Running..." />}
        {status === "thinking" && <Spinner text="Thinking..." />}
        {status === "responding" && <Spinner text="Responding..." />}
        {status === "awaiting_user" && (
          <Text color={COLORS.primary} bold>
            Waiting
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
            Waiting
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

        {extStatus && status === "idle" && (
          <Text color={COLORS.muted} dimColor>
            {extStatus}
          </Text>
        )}

        {agentTick >= 0 && agent && agent.getPlanModeState().phase !== "off" && (
          <Text color={COLORS.accent} dimColor>
            {(() => {
              const plan = agent.getPlanModeState();
              if (plan.phase === "executing") {
                const stats = agent.todoManager?.getStats();
                if (stats && stats.total > 0) {
                  return `plan ${stats.completed}/${stats.total}`;
                }
                return "plan exec";
              }
              if (plan.phase === "ready") {
                const steps = plan.steps.length > 0 ? ` (${plan.steps.length})` : "";
                const preserved = plan.preservedExistingTodos ? " · todos kept" : "";
                return `plan ready${steps} · /plan execute${preserved}`;
              }
              return "plan";
            })()}
          </Text>
        )}

        {/* Contextual shortcuts */}
        {isAgentBusy && !isPendingApproval && !showFreeformInput && !showSelectList && (
          <Text color={COLORS.muted} dimColor>
            {busyQueueHint(steerCount, followUpCount)}
          </Text>
        )}
        {(steerCount > 0 || followUpCount > 0) && !isAgentBusy && !isPendingApproval && (
          <Text color={COLORS.primary} dimColor>
            Queued: {steerCount > 0 ? `${steerCount} steer` : ""}
            {steerCount > 0 && followUpCount > 0 ? ", " : ""}
            {followUpCount > 0 ? `${followUpCount} follow-up` : ""}
          </Text>
        )}
        {isPendingApproval && !showFreeformInput && (
          <Text color={COLORS.warning} dimColor>
            {approvalKeysHint()}
          </Text>
        )}
        {showFreeformInput && (
          <Text color={COLORS.warning} dimColor>
            {freeformSubmitHint()}
          </Text>
        )}
        {showSelectList && (
          <Text color={COLORS.primary} dimColor>
            {selectListHint({ multiSelect: isMultiSelect, cursorOnFreeform })}
          </Text>
        )}
      </Box>
    </Box>
  );
};

/**
 * Bottom status bar — shows MCP, usage, model info.
 */
const StatusBar = ({ mcpCount }: { mcpCount: number }) => {
  const model = useConfig((s) => s.config.model);
  const { version } = useAgentUsage();

  return (
    <Box justifyContent="space-between" paddingX={1}>
      <Box gap={2} flexShrink={1}>
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
