import { Box, Text } from "ink";

import { FullBox } from "../components/FullBox.js";
import { formatToolInput } from "../utils/format.js";
import { getToolCallColor } from "../utils/toolState.js";

import { ToolOutputViewDynamic } from "./ToolOutputViewDynamic.js";
import { ToolOutputViewStatic } from "./ToolOutputViewStatic.js";
import { ToolStatusIcon } from "./ToolStatusIcon.js";

import type { ToolInvocationState } from "../utils/toolState.js";

/**
 * Tool invocation part from AI SDK
 * Represents a tool call with its state, input, and optionally output
 */
export interface ToolInvocationUIPart {
  type: string; // "tool-${name}" or "dynamic-tool"
  toolCallId: string;
  toolName: string;
  state: ToolInvocationState;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  approval?: {
    id: string;
    approved?: boolean;
    reason?: string;
  };
}

export interface ToolCallPartViewProps {
  part: ToolInvocationUIPart;
  staticItem?: boolean;
  addToolApprovalResponse?: (response: { id: string; approved: boolean }) => void;
}

/** Render a tool invocation part */
export const ToolCallPartView = ({ part, addToolApprovalResponse, staticItem }: ToolCallPartViewProps) => {
  const needsApproval = part.state === "approval-requested" && part.approval;

  const toolName = part.toolName || part.type.slice(5);

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

  return (
    <Box flexDirection="column">
      <FullBox borderStyle="round" borderColor={getToolCallColor(part.state)} paddingX={1}>
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
          </Box>

          {/* Show streaming input */}
          {part.state === "input-streaming" && displayInput && (
            <Box marginTop={1}>
              <Text color="gray" dimColor>
                {displayInput}...
              </Text>
            </Box>
          )}

          {/* Show output if available */}
          {!staticItem && hasOutput && (
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
      </FullBox>
    </Box>
  );
};
