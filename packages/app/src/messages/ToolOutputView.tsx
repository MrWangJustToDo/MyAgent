import { getToolPresentation } from "@my-agent/core";
import { Box, Text } from "ink";

import { HalfLinePaddedBox } from "../components/HalfLinePaddedBox.js";
import { useTranscriptDisplayMode } from "../context/transcript-display-context.js";
import { useSize } from "../hooks";
import { BG, COLORS } from "../theme/colors.js";
import { formatToolOutput } from "../utils/format";
import { splitStreamingLines } from "../utils/streaming-output-lines.js";
import { ALWAYS_VISIBLE_TOOL_NAMES, hasDetailedOutputBlock, keepsCompactRow } from "../utils/tool-display.js";

import { TodoToolOutputView } from "./TodoToolOutputView.js";

import type { UiToolState } from "../utils/tool-part.js";
import type { TodoItem } from "@my-agent/core";
import type { ToolCallPart } from "@tanstack/ai";

/** Max chars kept for a compact single-line result block. */
const COMPACT_LINE_MAX = 200;

/** Compact keeps one curated line (the `toUI` contract) instead of the full block. */
function clampCompactLine(line: string): string {
  return line.length > COMPACT_LINE_MAX ? `${line.slice(0, COMPACT_LINE_MAX - 1)}…` : line;
}

export const ToolOutputView = ({ part, uiState }: { part: ToolCallPart; uiState: UiToolState }) => {
  const mode = useTranscriptDisplayMode();
  const screenWidth = useSize((s) => s.state.screenWidth);
  const toolName = part.name;

  if (uiState !== "output-available" && uiState !== "output-error") return null;

  if (mode === "compact" && !keepsCompactRow(toolName)) {
    return null;
  }

  // Rich block background: message container paddingX=1 + tool column
  // paddingLeft=2 → width compensates so the right edge aligns with user
  // message boxes (screenWidth - 2).
  const boxWidth = Math.max(screenWidth - 4, 1);

  if (toolName === "todo") {
    const output = part.output as { items?: TodoItem[]; title?: string; source?: "plan" | "agent" };
    if (!output.items) return null;
    return (
      <HalfLinePaddedBox backgroundColor={BG.toolResult} width={boxWidth}>
        <TodoToolOutputView items={output.items} title={output.title} source={output.source} />
      </HalfLinePaddedBox>
    );
  }

  if (toolName === "ask_user" && uiState === "output-error") return null;

  const isDetailed = hasDetailedOutputBlock(toolName);
  const output = formatToolOutput(part.output, toolName);

  // Error outputs carry `{ error }` (no formattable body) — the message is
  // rendered by ToolCallPartView, so skip the otherwise-empty result block.
  if (uiState === "output-error" && !output.trim()) return null;

  // Extension (and other) tools: show the default block only when toUI produced non-empty text.
  if (!isDetailed) {
    if (!getToolPresentation(toolName)?.text || !output.trim()) return null;
  }

  const outputLines = splitStreamingLines(output);
  // Structured tools keep their full block in both modes; anything else allowed to
  // render in compact (i.e. a registered toUI) is one clamped line.
  const lines =
    mode === "compact" && !ALWAYS_VISIBLE_TOOL_NAMES.has(toolName)
      ? [clampCompactLine(outputLines[0] ?? "")]
      : outputLines;
  const failed = toolName === "run_command" && (part.output as { success?: boolean } | undefined)?.success === false;
  const lineColor = failed ? COLORS.danger : COLORS.muted;

  return (
    <HalfLinePaddedBox backgroundColor={BG.toolResult} width={boxWidth}>
      <Box flexDirection="column" paddingLeft={2}>
        {lines.map((line, i) => (
          <Text key={i} color={lineColor} dimColor={!failed}>
            {line.length > 0 ? line : " "}
          </Text>
        ))}
      </Box>
    </HalfLinePaddedBox>
  );
};
