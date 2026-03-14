import { Box, Text } from "ink";

import { formatToolInput, formatToolOutput } from "../../utils/format.js";
import { getToolCallColor } from "../../utils/toolState.js";

import { ToolStatusIcon } from "./ToolStatusIcon.js";

import type { ToolCallPart } from "@my-agent/core";

export interface ToolCallPartViewProps {
  part: ToolCallPart;
  addToolApprovalResponse?: (response: { id: string; approved: boolean }) => void;
}

/** Render a tool call part */
export const ToolCallPartView = ({ part, addToolApprovalResponse }: ToolCallPartViewProps) => {
  const needsApproval = part.state === "approval-requested" && part.approval;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box borderStyle="round" borderColor={getToolCallColor(part.state)} paddingX={1}>
        <Box flexDirection="column">
          {/* Header */}
          <Box>
            <ToolStatusIcon state={part.state} />
            <Text color={getToolCallColor(part.state)}> {part.name}</Text>
            {part.arguments && (
              <Text color="gray" dimColor>
                {" "}
                {formatToolInput(JSON.parse(part.arguments))}
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
              <Box marginTop={1}>
                <Text color="gray">Arguments: </Text>
                <Text>{part.arguments}</Text>
              </Box>
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
      </Box>
    </Box>
  );
};
