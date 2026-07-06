import { getToolName } from "ai";
import { Box, Text } from "ink";

import { StreamingOutputView } from "../components/StreamingOutputView.js";
import { useStreamingOutput } from "../hooks/use-streaming-output.js";
import { COLORS } from "../theme/colors.js";
import {
  buildToolHeader,
  DURATION_THRESHOLD_MS,
  formatDuration,
  formatToolInput,
  getCompactOutput,
  getDurationMs,
  getInlineSummary,
  getToolCallColor,
} from "../utils/format.js";

import { ToolInputView } from "./ToolInputView.js";
import { ToolOutputView } from "./ToolOutputView.js";
import { ToolStatusIcon } from "./ToolStatusIcon.js";

import type { ToolUIPart } from "ai";

// ============================================================================
// Helpers
// ============================================================================

/** Strip the <error>...</error> wrapper meant for LLM consumption, keeping only the user-provided reason. */
function extractDeniedReason(reason: string | undefined | null): string | null {
  if (!reason) return null;
  const cleaned = reason.replace(/<error>.*?<\/error>\s*/g, "").trim();
  return cleaned || null;
}

// ============================================================================
// Component
// ============================================================================

export interface ToolCallPartViewProps {
  part: ToolUIPart;
  /** Suppress approval UI (subagent preview is read-only). */
  readOnly?: boolean;
}

/** Render a tool invocation part — unified compact style for all tools */
export const ToolCallPartView = ({ part, readOnly = false }: ToolCallPartViewProps) => {
  const needsApproval = !readOnly && part.state === "approval-requested" && part.approval;
  const toolName = getToolName(part);

  // Check if this is a run_command tool that's currently executing
  const isRunCommand = toolName === "run_command";
  const isTask = toolName === "task";
  const isExecuting =
    part.state === "input-available" || part.state === "input-streaming" || part.state === "approval-responded";
  const taskStream = useStreamingOutput(isTask && isExecuting ? part.toolCallId : undefined, isTask && isExecuting);
  const showTaskSummaryStream = isTask && isExecuting && Boolean(taskStream?.stdout);

  const getDisplayInput = (): string | null => {
    if (part.input === undefined || part.input === null) return null;
    const formatted = formatToolInput(part.input, toolName);
    return formatted || null;
  };

  const displayInput = getDisplayInput();
  const hasOutput =
    part.state === "output-available" || part.state === "output-error" || part.state === "output-denied";
  const durationMs = hasOutput ? getDurationMs(part.output) : null;
  const showDuration = durationMs !== null && durationMs >= DURATION_THRESHOLD_MS;

  const hasError = part.state === "output-error" || part.state === "output-denied";
  // Error text resolution:
  // 1. output-denied → user's deny reason
  // 2. output-error  → AI SDK's errorText (from thrown exceptions)
  // Tools throw on failure; the AI SDK surfaces the error via output-error state.
  const errorText =
    hasError && part.state === "output-denied"
      ? extractDeniedReason(part.approval?.reason)
      : hasError
        ? part.errorText
        : null;

  // Suppress inline summary when an error is present so the header doesn't
  // show a misleading success summary alongside the error text.
  const inlineSummary = errorText ? null : getInlineSummary(part, toolName);
  const compactOutput = hasOutput ? getCompactOutput(part, toolName) : null;
  // run_command keeps state `output-available` even when `success: false`.
  // Route those to the danger color so the header matches the failed output.
  const outputFailed = (part.output as { success?: boolean } | undefined)?.success === false;
  const stateColor = errorText || outputFailed ? COLORS.danger : getToolCallColor(part.state);

  // Build parenthetical: "(summary, duration)"
  const parenParts: string[] = [];
  if (inlineSummary) parenParts.push(inlineSummary);
  if (showDuration) parenParts.push(formatDuration(durationMs!));
  const parenText = parenParts.length > 0 ? ` (${parenParts.join(", ")})` : "";

  // Single chalk-styled string for everything after the icon
  const headerText = buildToolHeader(toolName, displayInput, parenText, stateColor);

  return (
    <Box flexDirection="column" paddingLeft={2}>
      {/* Header: [icon] toolName args (summary, duration) */}
      <Box flexDirection="row">
        <Box flexShrink={0} width={2}>
          <ToolStatusIcon part={part} state={part.state} />
        </Box>
        <Text wrap="wrap">{headerText}</Text>
      </Box>

      {/* Tool input (diffs, command text) */}
      <ToolInputView part={part} />

      {/* Streaming output for run_command and task summary */}
      {isRunCommand && isExecuting && (
        <StreamingOutputView toolCallId={part.toolCallId} enabled={isRunCommand && isExecuting} />
      )}
      {showTaskSummaryStream && (
        <StreamingOutputView toolCallId={part.toolCallId} enabled={showTaskSummaryStream} emptyMessage="" />
      )}

      {/* Approval prompt */}
      {needsApproval && (
        <Box paddingLeft={2}>
          <Text color={COLORS.warning}>
            Approval required: Press <Text bold>y</Text> to approve, <Text bold>n</Text> to deny
          </Text>
        </Box>
      )}

      {/* Detailed output for run_command/task */}
      {hasOutput && <ToolOutputView part={part} />}

      {/* Compact output or error */}
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
