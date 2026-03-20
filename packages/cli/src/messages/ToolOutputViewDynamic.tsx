import { getToolName, type ToolUIPart } from "ai";
import { Text } from "ink";
import { memo } from "react";

import { formatToolOutput } from "../utils/format";

export const ToolOutputViewDynamic = memo(
  ({ part }: { part: ToolUIPart }) => {
    // Check if output is available (state indicates completion)
    const hasOutput = part.state === "output-available" || part.state === "output-error";

    if (!hasOutput) return null;

    if (part.errorText) {
      return <Text color="red">{part.errorText}</Text>;
    }

    const toolName = getToolName(part);

    // Use tool-specific formatter for better output display
    return <Text color="gray">{formatToolOutput(part.output, toolName)}</Text>;
  },
  (p, c) => {
    const pOutput = p.part.output;
    const cOutput = c.part.output;
    return pOutput === cOutput;
  }
);

ToolOutputViewDynamic.displayName = "ToolOutputViewDynamic";
