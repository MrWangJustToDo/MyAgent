import { Box, Text } from "ink";

import { FullBox } from "../components/FullBox.js";
import { formatToolInput } from "../utils/format.js";
import { getToolCallColor } from "../utils/toolState.js";

import { ToolOutputView } from "./ToolOutputView.js";
import { ToolStatusIcon } from "./ToolStatusIcon.js";

import type { ToolCallPart } from "@my-agent/core";

export interface ToolCallPartViewProps {
  part: ToolCallPart;
  staticItem?: boolean;
  addToolApprovalResponse?: (response: { id: string; approved: boolean }) => void;
  /**
   * Tool input from approval-requested custom event.
   * Used when part.arguments is empty (TanStack AI doesn't populate it during approval).
   */
  approvalInput?: unknown;
}

/** Render a tool call part */
export const ToolCallPartView = ({
  part,
  addToolApprovalResponse,
  approvalInput,
  staticItem,
}: ToolCallPartViewProps) => {
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
      <FullBox borderStyle="round" borderColor={getToolCallColor(part.state)} paddingX={1}>
        <Box flexDirection="column" width="100%">
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
            </Box>
          )}

          {/* Show output if available */}
          {!staticItem && part.output !== undefined && (
            <Box marginTop={1} flexDirection="column" width="100%">
              <ToolOutputView part={part} />
            </Box>
          )}
        </Box>
      </FullBox>
    </Box>
  );
};
