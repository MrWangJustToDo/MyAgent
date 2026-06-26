import { getToolName, type ToolUIPart } from "ai";
import { Box, Text } from "ink";

import { formatToolOutput } from "../utils/format";

/** Tools that show detailed multi-line output */
const DETAILED_OUTPUT_TOOLS = new Set(["run_command", "task"]);

export const ToolOutputView = ({ part }: { part: ToolUIPart }) => {
  if (part.state !== "output-available") return null;

  const toolName = getToolName(part);

  if (!DETAILED_OUTPUT_TOOLS.has(toolName)) return null;

  return (
    <Box paddingLeft={2}>
      <Text color="gray" dimColor wrap="truncate-end">
        {formatToolOutput(part.output, toolName)}
      </Text>
    </Box>
  );
};
