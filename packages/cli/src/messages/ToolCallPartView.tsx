import { getToolName } from "ai";
import { Box, Text } from "ink";

import { formatToolInput, formatDuration } from "../utils/format.js";
import { getToolCallColor } from "../utils/tool-state.js";

import { useStaticContext } from "./StaticContext.js";
import { ToolInputView } from "./ToolInputView.js";
import { ToolOutputView } from "./ToolOutputView.js";
import { ToolStatusIcon } from "./ToolStatusIcon.js";

import type { ToolUIPart } from "ai";

export interface ToolCallPartViewProps {
  part: ToolUIPart;
}

/** Extract durationMs from tool output if available */
const getDurationMs = (output: unknown): number | null => {
  if (output && typeof output === "object" && "durationMs" in output) {
    const durationMs = (output as { durationMs?: unknown }).durationMs;
    if (typeof durationMs === "number") {
      return durationMs;
    }
  }
  return null;
};

/** Get a compact one-line output summary */
function getCompactOutput(part: ToolUIPart): string | null {
  const output = part.output as Record<string, unknown> | undefined;
  if (!output) return null;
  if (typeof output.message === "string") return output.message;
  return null;
}

/** Build the header text: " toolName args (duration)" */
function buildHeaderText(toolName: string, displayInput: string | null, durationMs: number | null): string {
  let header = ` ${toolName}`;

  if (displayInput) {
    header += ` ${displayInput}`;
  }

  if (durationMs !== null) {
    header += ` (${formatDuration(durationMs)})`;
  }

  return header;
}

/** Render a tool invocation part — unified compact style for all tools */
export const ToolCallPartView = ({ part }: ToolCallPartViewProps) => {
  const needsApproval = part.state === "approval-requested" && part.approval;
  const toolName = getToolName(part);

  const { staticMessage } = useStaticContext();

  const getDisplayInput = (): string | null => {
    if (part.input === undefined || part.input === null) return null;
    // For run_command, only show in header for static (history) messages; live input is shown by ToolInputView
    if (toolName === "run_command" && !staticMessage) return null;
    const formatted = formatToolInput(part.input, toolName);
    return formatted || null;
  };

  const displayInput = getDisplayInput();
  const hasOutput =
    part.state === "output-available" || part.state === "output-error" || part.state === "output-denied";
  const durationMs = hasOutput ? getDurationMs(part.output) : null;

  const hasError = part.state === "output-error" || part.state === "output-denied";
  const errorText =
    hasError && part.state === "output-denied"
      ? (part.approval?.reason ?? "Tool execution denied.")
      : hasError
        ? part.errorText
        : null;

  const compactOutput = hasOutput ? getCompactOutput(part) : null;
  const headerText = buildHeaderText(toolName, displayInput, durationMs);

  return (
    <Box flexDirection="column" paddingLeft={2}>
      {/* Header: ✓ toolName args (duration) */}
      <Box>
        <Box flexShrink={0}>
          <ToolStatusIcon state={part.state} />
        </Box>
        <Text color={getToolCallColor(part.state)} dimColor wrap="truncate-end">
          {headerText}
        </Text>
      </Box>

      {/* Tool input (diffs, command text) */}
      <ToolInputView part={part} />

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

      {/* Approval prompt */}
      {needsApproval && (
        <Box paddingLeft={2}>
          <Text color="yellow" bold>
            Approval required. Press Y to approve, N to deny.
          </Text>
        </Box>
      )}
    </Box>
  );
};
