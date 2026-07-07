import { Box, Text } from "ink";

import { COLORS } from "../theme/colors.js";
import { formatToolOutput } from "../utils/format";

import { TodoToolOutputView } from "./TodoToolOutputView.js";

import type { UiToolState } from "../utils/tool-part.js";
import type { TodoItem } from "@my-agent/core";
import type { ToolCallPart } from "@tanstack/ai";

const DETAILED_OUTPUT_TOOLS = new Set(["run_command", "task", "ask_user", "todo"]);

export const ToolOutputView = ({ part, uiState }: { part: ToolCallPart; uiState: UiToolState }) => {
  if (uiState !== "output-available" && uiState !== "output-error") return null;

  const toolName = part.name;

  if (!DETAILED_OUTPUT_TOOLS.has(toolName)) return null;

  if (toolName === "todo") {
    const output = part.output as { items?: TodoItem[] };
    if (!output.items) return null;
    return <TodoToolOutputView items={output.items} />;
  }

  const output = formatToolOutput(part.output, toolName);
  const lines = output.split("\n");
  const failed = toolName === "run_command" && (part.output as { success?: boolean } | undefined)?.success === false;
  const lineColor = failed ? COLORS.danger : COLORS.muted;

  return (
    <Box flexDirection="column" paddingLeft={2}>
      {lines.map((line, i) => (
        <Text key={i} color={lineColor} dimColor={!failed}>
          {line}
        </Text>
      ))}
    </Box>
  );
};
