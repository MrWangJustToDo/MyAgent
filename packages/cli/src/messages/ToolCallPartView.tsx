import { getToolName } from "ai";
import { Box, Text } from "ink";

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

export interface ToolCallPartViewProps {
  part: ToolUIPart;
}

/** Render a tool invocation part — unified compact style for all tools */
export const ToolCallPartView = ({ part }: ToolCallPartViewProps) => {
  const needsApproval = part.state === "approval-requested" && part.approval;
  const toolName = getToolName(part);

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
  const errorText =
    hasError && part.state === "output-denied"
      ? (part.approval?.reason ?? "Tool execution denied.")
      : hasError
        ? part.errorText
        : null;

  const inlineSummary = getInlineSummary(part, toolName);
  const compactOutput = hasOutput ? getCompactOutput(part, toolName) : null;
  const stateColor = getToolCallColor(part.state);

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
          <ToolStatusIcon state={part.state} />
        </Box>
        <Text wrap="wrap">{headerText}</Text>
      </Box>

      {/* Tool input (diffs, command text) */}
      <ToolInputView part={part} />

      {/* Approval prompt */}
      {needsApproval && (
        <Box paddingLeft={2}>
          <Text color="yellow">
            Approval required: Press <Text bold>y</Text> to approve, <Text bold>n</Text> to deny
          </Text>
        </Box>
      )}

      {/* Detailed output for run_command/task */}
      {hasOutput && <ToolOutputView part={part} />}

      {/* Compact output or error */}
      {errorText && (
        <Box paddingLeft={2}>
          <Text color="red" wrap="truncate-end">
            {errorText}
          </Text>
        </Box>
      )}
      {compactOutput && !errorText && (
        <Box paddingLeft={2}>
          <Text color="gray" dimColor wrap="truncate-end">
            {compactOutput}
          </Text>
        </Box>
      )}
    </Box>
  );
};
