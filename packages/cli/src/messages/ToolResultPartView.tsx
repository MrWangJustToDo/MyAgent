import { Box, Text } from "ink";

import { FullBox } from "../components/FullBox";
import { formatToolOutput } from "../utils/format";

import type { ToolInvocationUIPart } from "./ToolCallPartView.js";

export interface ToolResultPartViewProps {
  part: ToolInvocationUIPart;
}

/** Render a tool result part (output available state) */
export const ToolResultPartView = ({ part }: ToolResultPartViewProps) => {
  const isError = part.state === "output-error";

  // Format output for display
  const displayContent = part.output !== undefined && part.output !== null ? formatToolOutput(part.output) : null;

  return (
    <Box flexDirection="column">
      <FullBox borderStyle="round" borderColor={isError ? "red" : "green"} paddingX={1}>
        <Box flexDirection="column">
          <Box>
            <Text color={isError ? "red" : "green"}>{isError ? "x" : "v"} </Text>
            <Text color="gray">Tool Result: {part.toolName}</Text>
          </Box>
          {displayContent && (
            <Box marginTop={1}>
              <Text color={isError ? "red" : "gray"}>{displayContent}</Text>
            </Box>
          )}
          {part.errorText && (
            <Box marginTop={1}>
              <Text color="red">{part.errorText}</Text>
            </Box>
          )}
        </Box>
      </FullBox>
    </Box>
  );
};
