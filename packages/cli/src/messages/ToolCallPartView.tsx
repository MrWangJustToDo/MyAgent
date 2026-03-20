import { getToolName } from "ai";
import { Box, Text } from "ink";

import { formatToolInput, formatDuration } from "../utils/format.js";
import { getToolCallColor } from "../utils/tool-state.js";

import { ToolInputView } from "./ToolInputView.js";
import { ToolOutputViewDynamic } from "./ToolOutputViewDynamic.js";
import { ToolOutputViewStatic } from "./ToolOutputViewStatic.js";
import { ToolStatusIcon } from "./ToolStatusIcon.js";

import type { ToolUIPart } from "ai";

export interface ToolCallPartViewProps {
  part: ToolUIPart;
  staticItem?: boolean;
  addToolApprovalResponse?: (response: { id: string; approved: boolean }) => void;
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

/** Render a tool invocation part */
export const ToolCallPartView = ({ part, addToolApprovalResponse, staticItem }: ToolCallPartViewProps) => {
  const needsApproval = part.state === "approval-requested" && part.approval;

  const toolName = getToolName(part);

  // Get the input to display - prefer part.input, fallback to approvalInput
  const getDisplayInput = (): string | null => {
    if (part.input !== undefined && part.input !== null) {
      return typeof part.input === "string" ? part.input : JSON.stringify(part.input);
    }
    return null;
  };

  const displayInput = getDisplayInput();

  // Check if output is available (state indicates completion)
  const hasOutput = part.state === "output-available" || part.state === "output-error";

  // Get duration from output if available
  const durationMs = hasOutput ? getDurationMs(part.output) : null;

  return (
    <Box borderStyle="round" width="100%" borderColor={getToolCallColor(part.state)} paddingX={1}>
      <Box flexDirection="column" width="100%">
        {/* Header */}
        <Box>
          <ToolStatusIcon state={part.state} />
          <Text color={getToolCallColor(part.state)}> {toolName}</Text>
          {displayInput && (
            <Text color="gray" dimColor>
              {" "}
              {formatToolInput(JSON.parse(displayInput))}
            </Text>
          )}
          {durationMs !== null && (
            <Text color="gray" dimColor>
              {" "}
              ({formatDuration(durationMs)})
            </Text>
          )}
        </Box>

        {/* Show streaming input */}
        {part.state === "input-streaming" && displayInput && (
          <Box marginTop={1}>
            <Text color="gray" dimColor>
              {displayInput}...
            </Text>
          </Box>
        )}

        <ToolInputView part={part} />

        {/* Show output if available */}
        {hasOutput && (
          <Box marginTop={1} flexDirection="column" width="100%">
            {staticItem ? <ToolOutputViewStatic part={part} /> : <ToolOutputViewDynamic part={part} />}
          </Box>
        )}

        {/* Approval prompt */}
        {needsApproval && addToolApprovalResponse && (
          <Box marginTop={1} flexDirection="column">
            <Text color="yellow" bold>
              Approval required. Press Y to approve, N to deny.
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};
