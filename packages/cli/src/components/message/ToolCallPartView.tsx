import { Box, Text } from "ink";

import { formatToolInput, formatToolOutput } from "../../utils/format.js";
import { getToolCallColor } from "../../utils/toolState.js";
import { FullBox } from "../FullBox.js";

import { ToolStatusIcon } from "./ToolStatusIcon.js";

import type { ToolCallPart } from "@my-agent/core";

export interface ToolCallPartViewProps {
  part: ToolCallPart;
  addToolApprovalResponse?: (response: { id: string; approved: boolean }) => void;
  /**
   * Tool input from approval-requested custom event.
   * Used when part.arguments is empty (TanStack AI doesn't populate it during approval).
   */
  approvalInput?: unknown;
}

/** Render a tool call part */
export const ToolCallPartView = ({ part, addToolApprovalResponse, approvalInput }: ToolCallPartViewProps) => {
  const needsApproval = part.state === "approval-requested" && part.approval;

  // Get the arguments to display - prefer part.arguments, fallback to approvalInput
  const getDisplayArguments = (): string | null => {
    if (part.arguments) {
      return part.arguments;
    }
    if (approvalInput !== undefined) {
      return typeof approvalInput === "string" ? approvalInput : JSON.stringify(approvalInput);
    }
    return null;
  };

  const displayArguments = getDisplayArguments();

  return (
    <Box flexDirection="column">
      <FullBox borderStyle="round" width="100%" borderColor={getToolCallColor(part.state)} paddingX={1}>
        <Box flexDirection="column">
          {/* Header */}
          <Box>
            <ToolStatusIcon state={part.state} />
            <Text color={getToolCallColor(part.state)}> {part.name}</Text>
            {displayArguments && (
              <Text color="gray" dimColor>
                {" "}
                {formatToolInput(JSON.parse(displayArguments))}
              </Text>
            )}
          </Box>

          {/* Show streaming arguments */}
          {(part.state === "awaiting-input" || part.state === "input-streaming") && part.arguments && (
            <Box marginTop={1}>
              <Text color="gray" dimColor>
                {part.arguments}...
              </Text>
            </Box>
          )}

          {/* Approval prompt */}
          {needsApproval && addToolApprovalResponse && (
            <Box marginTop={1} flexDirection="column">
              <Text color="yellow" bold>
                Approval required. Press Y to approve, N to deny.
              </Text>
              {/* <Box marginTop={1}>
                <Text color="gray">Arguments: </Text>
                <Text>{displayArguments ?? "(no arguments)"}</Text>
              </Box> */}
            </Box>
          )}

          {/* Show output if available */}
          {part.output !== undefined && (
            <Box marginTop={1} flexDirection="column">
              <Text color="gray" dimColor>
                Output:
              </Text>
              <Box paddingLeft={1}>
                <Text color="gray">{formatToolOutput(part.output)}</Text>
              </Box>
            </Box>
          )}
        </Box>
      </FullBox>
    </Box>
  );
};
