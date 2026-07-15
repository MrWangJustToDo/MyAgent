import { Box, Text } from "ink";

import { StreamingOutputView } from "../components/StreamingOutputView.js";
import { useLiveElapsedMs } from "../hooks/use-live-elapsed.js";
import { useTask } from "../hooks/use-task.js";
import { COLORS } from "../theme/colors.js";
import { formatUsageBrief } from "../utils/format-usage.js";
import {
  buildToolHeader,
  DURATION_THRESHOLD_MS,
  formatDuration,
  formatToolInput,
  getCompactOutput,
  getDurationMs,
  getInlineSummary,
  getToolCallColor,
  LIVE_DURATION_THRESHOLD_MS,
} from "../utils/format.js";
import { getUiToolState, isToolExecuting, parseToolInput } from "../utils/tool-part.js";

import { ToolInputView } from "./ToolInputView.js";
import { ToolOutputView } from "./ToolOutputView.js";
import { ToolStatusIcon } from "./ToolStatusIcon.js";

import type { ToolCallPart } from "@tanstack/ai";

function extractErrorText(part: ToolCallPart): string | null {
  const uiState = getUiToolState(part);
  if (uiState === "output-denied") {
    const approvalReason = (part.approval as { reason?: string } | undefined)?.reason;
    if (approvalReason) return approvalReason;

    const output = part.output;
    if (output && typeof output === "object" && "message" in output) {
      return String((output as { message?: unknown }).message ?? "Denied");
    }
    if (output && typeof output === "object" && "error" in output) {
      return String((output as { error?: unknown }).error ?? "Denied");
    }
    return "Denied";
  }
  if (uiState === "output-error") {
    const output = part.output;
    if (output && typeof output === "object" && "error" in output) {
      return String((output as { error?: unknown }).error);
    }
    return "Tool error";
  }
  return null;
}

export interface ToolCallPartViewProps {
  part: ToolCallPart;
  readOnly?: boolean;
  /** Throttle for live `run_command` / `task` stream UI updates (ms). Default: 100 for run_command, 0 for task. */
  streamingThrottleMs?: number;
}

const RUN_COMMAND_STREAM_THROTTLE_MS = 100;

/** Render a tool invocation part — unified compact style for all tools */
export const ToolCallPartView = ({ part, readOnly = false, streamingThrottleMs }: ToolCallPartViewProps) => {
  const uiState = getUiToolState(part);
  const toolName = part.name;
  const toolCallId = part.id;
  const toolInput = parseToolInput(part);
  const needsApproval = !readOnly && uiState === "approval-requested" && part.approval;

  const isRunCommand = toolName === "run_command";
  const isTask = toolName === "task";
  const isExecuting = isToolExecuting(part);
  const liveElapsedMs = useLiveElapsedMs(toolCallId, isExecuting, LIVE_DURATION_THRESHOLD_MS);
  const taskInput = toolInput as { id?: string } | null;
  const { phase: taskPhase, usage: taskUsage } = useTask({
    id: isTask && taskInput?.id ? taskInput.id : "",
    taskId: part.id,
  });
  const showTaskSummaryStream = isTask && isExecuting && taskPhase === "summary";

  const displayInput =
    toolInput === undefined || toolInput === null ? null : formatToolInput(toolInput, toolName) || null;

  const hasOutput = uiState === "output-available" || uiState === "output-error" || uiState === "output-denied";
  const durationMs = hasOutput ? getDurationMs(part.output) : null;
  const showDuration = durationMs !== null && durationMs >= DURATION_THRESHOLD_MS;

  const errorText = extractErrorText(part);
  const inlineSummary = errorText ? null : getInlineSummary(part, toolName);
  const compactOutput = hasOutput ? getCompactOutput(part, toolName) : null;
  const outputFailed = (part.output as { success?: boolean } | undefined)?.success === false;
  const stateColor = errorText || outputFailed ? COLORS.danger : getToolCallColor(uiState);

  const outputUsage =
    isTask && hasOutput && part.output && typeof part.output === "object" && "usage" in part.output
      ? (part.output as { usage?: { inputTokens?: number; outputTokens?: number } }).usage
      : null;
  const displayUsage = taskUsage ?? outputUsage ?? null;

  const parenParts: string[] = [];
  if (inlineSummary) parenParts.push(inlineSummary);
  if (showDuration) {
    parenParts.push(formatDuration(durationMs!));
  } else if (liveElapsedMs != null) {
    parenParts.push(formatDuration(liveElapsedMs));
  }
  if (isTask && displayUsage && ((displayUsage.inputTokens ?? 0) > 0 || (displayUsage.outputTokens ?? 0) > 0)) {
    parenParts.push(
      formatUsageBrief({
        inputTokens: displayUsage.inputTokens ?? 0,
        outputTokens: displayUsage.outputTokens ?? 0,
      })
    );
  }
  const parenText = parenParts.length > 0 ? ` (${parenParts.join(", ")})` : "";
  const headerText = buildToolHeader(toolName, displayInput, parenText, stateColor);

  return (
    <Box flexDirection="column" paddingLeft={2}>
      <Box flexDirection="row">
        <Box flexShrink={0} width={2}>
          <ToolStatusIcon state={uiState} toolName={toolName} />
        </Box>
        <Text wrap="wrap">{headerText}</Text>
      </Box>

      <ToolInputView part={part} toolInput={toolInput} uiState={uiState} />

      {isRunCommand && isExecuting && (
        <StreamingOutputView
          toolCallId={toolCallId}
          enabled={isRunCommand && isExecuting}
          throttleMs={streamingThrottleMs ?? RUN_COMMAND_STREAM_THROTTLE_MS}
        />
      )}
      {showTaskSummaryStream && (
        <StreamingOutputView
          toolCallId={toolCallId}
          enabled={showTaskSummaryStream}
          throttleMs={streamingThrottleMs ?? 0}
        />
      )}

      {needsApproval && (
        <Box paddingLeft={2}>
          <Text color={COLORS.warning}>
            Approval required: Press <Text bold>y</Text> to approve, <Text bold>n</Text> to deny
          </Text>
        </Box>
      )}

      {hasOutput && <ToolOutputView part={part} uiState={uiState} />}

      {errorText && (
        <Box paddingLeft={2}>
          <Text color={COLORS.danger} wrap="truncate-end">
            {errorText}
          </Text>
        </Box>
      )}
      {compactOutput && !errorText && (
        <Box paddingLeft={2}>
          <Text
            color={(part.output as { success?: boolean } | undefined)?.success === false ? COLORS.danger : COLORS.muted}
            dimColor={(part.output as { success?: boolean } | undefined)?.success !== false}
            wrap="truncate-end"
          >
            {compactOutput}
          </Text>
        </Box>
      )}
    </Box>
  );
};
