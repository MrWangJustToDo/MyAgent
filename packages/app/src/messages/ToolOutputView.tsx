import { getToolName, type ToolUIPart } from "ai";
import { Box, Text } from "ink";

import { formatToolOutput } from "../utils/format";

import { TodoToolOutputView } from "./TodoToolOutputView.js";

import type { TodoItem } from "@my-agent/core";

/** Tools that show detailed multi-line output */
const DETAILED_OUTPUT_TOOLS = new Set(["run_command", "task", "ask_user", "todo"]);

export const ToolOutputView = ({ part }: { part: ToolUIPart }) => {
  if (part.state !== "output-available") return null;

  const toolName = getToolName(part);

  if (!DETAILED_OUTPUT_TOOLS.has(toolName)) return null;

  // `todo` gets a dedicated rich renderer (status-colored icons).
  // Title and progress are shown in the tool header, not repeated here.
  if (toolName === "todo") {
    const output = part.output as { items?: TodoItem[] };
    if (!output.items) return null;
    return <TodoToolOutputView items={output.items} />;
  }

  const output = formatToolOutput(part.output, toolName);
  const lines = output.split("\n");

  return (
    <Box flexDirection="column" paddingLeft={2}>
      {lines.map((line, i) => (
        <Text key={i} color="gray" dimColor>
          {line}
        </Text>
      ))}
    </Box>
  );
};
