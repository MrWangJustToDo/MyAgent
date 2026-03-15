import { Box, Text } from "ink";

import { FullBox } from "../components/FullBox";

import type { ToolResultPart } from "@my-agent/core";

export interface ToolResultPartViewProps {
  part: ToolResultPart;
}

/** Render a tool result part */
export const ToolResultPartView = ({ part }: ToolResultPartViewProps) => {
  const isError = part.state === "error";

  return (
    <Box flexDirection="column">
      <FullBox borderStyle="round" borderColor={isError ? "red" : "green"} paddingX={1}>
        <Box flexDirection="column">
          <Box>
            <Text color={isError ? "red" : "green"}>{isError ? "x" : "v"} </Text>
            <Text color="gray">Tool Result</Text>
          </Box>
          {part.content && (
            <Box marginTop={1}>
              <Text color={isError ? "red" : "gray"}>{part.content}</Text>
            </Box>
          )}
          {part.error && (
            <Box marginTop={1}>
              <Text color="red">{part.error}</Text>
            </Box>
          )}
        </Box>
      </FullBox>
    </Box>
  );
};
