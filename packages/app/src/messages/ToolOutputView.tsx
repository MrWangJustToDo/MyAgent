import { getToUI } from "@my-agent/core";
import { Box, Text } from "ink";

import { COLORS } from "../theme/colors.js";
import { formatToolOutput } from "../utils/format";
import { splitStreamingLines } from "../utils/streaming-output-lines.js";

import { TodoToolOutputView } from "./TodoToolOutputView.js";

import type { UiToolState } from "../utils/tool-part.js";
import type { TodoItem } from "@my-agent/core";
import type { ToolCallPart } from "@tanstack/ai";

/** Built-in tools that always render a detailed output block. */
const DETAILED_OUTPUT_TOOLS = new Set([
  "run_command",
  "get_command_output",
  "kill_command",
  "task",
  "ask_user",
  "todo",
]);

export const ToolOutputView = ({ part, uiState }: { part: ToolCallPart; uiState: UiToolState }) => {
  if (uiState !== "output-available" && uiState !== "output-error") return null;

  const toolName = part.name;

  if (toolName === "todo") {
    const output = part.output as { items?: TodoItem[] };
    if (!output.items) return null;
    return <TodoToolOutputView items={output.items} />;
  }

  const isBuiltinDetailed = DETAILED_OUTPUT_TOOLS.has(toolName);
  const output = formatToolOutput(part.output, toolName);

  // Extension (and other) tools: show the default block only when toUI produced non-empty text.
  if (!isBuiltinDetailed) {
    if (!getToUI(toolName) || !output.trim()) return null;
  }

  const lines = splitStreamingLines(output);
  const failed = toolName === "run_command" && (part.output as { success?: boolean } | undefined)?.success === false;
  const lineColor = failed ? COLORS.danger : COLORS.muted;

  return (
    <Box flexDirection="column" paddingLeft={2}>
      {lines.map((line, i) => (
        <Text key={i} color={lineColor} dimColor={!failed}>
          {line.length > 0 ? line : " "}
        </Text>
      ))}
    </Box>
  );
};
