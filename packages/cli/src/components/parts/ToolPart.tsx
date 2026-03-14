import { TitledBox } from "@mishieck/ink-titled-box";
import { Box, Text } from "ink";

import { formatToolInput, formatToolOutput, getStatusColor } from "../../utils/format.js";
import { Spinner } from "../Spinner.js";

import type { ToolRenderPart, ToolCallStatus } from "@my-agent/core";

export interface ToolPartProps {
  part: ToolRenderPart;
}

/** Get status icon for tool */
function StatusIcon({ status }: { status: ToolCallStatus }) {
  switch (status) {
    case "streaming":
    case "pending":
    case "running":
    case "approved":
      return <Spinner text="" />;
    case "success":
      return <Text color="green">v</Text>;
    case "error":
      return <Text color="red">x</Text>;
    case "rejected":
      return <Text color="yellow">-</Text>;
    case "need-approve":
      return <Text color="yellow">?</Text>;
    default:
      return null;
  }
}

export const ToolPart = ({ part }: ToolPartProps) => {
  const showOutput = part.status === "success" && part.output;
  const showError = part.status === "error" && part.error;
  const showInput = part.status === "streaming" && part.inputText;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <TitledBox titles={[part.title || "Tool"]} borderStyle="round" borderColor={getStatusColor(part.status)}>
        <Box>
          <StatusIcon status={part.status} />
          <Text color={getStatusColor(part.status)}> {part.name}</Text>
          <Text color="gray" dimColor>
            {" "}
            {formatToolInput(part.input)}
          </Text>
        </Box>

        {/* Show streaming input */}
        {showInput && (
          <Box marginTop={1}>
            <Text color="gray" dimColor>
              {part.inputText}...
            </Text>
          </Box>
        )}

        {/* Show output on success */}
        {showOutput && (
          <Box marginTop={1} flexDirection="column">
            <Text color="gray" dimColor>
              Output:
            </Text>
            <Box paddingLeft={1}>
              <Text color="gray">{formatToolOutput(part.output)}</Text>
            </Box>
          </Box>
        )}

        {/* Show error */}
        {showError && (
          <Box marginTop={1}>
            <Text color="red">{String(part.error)}</Text>
          </Box>
        )}
      </TitledBox>
    </Box>
  );
};
