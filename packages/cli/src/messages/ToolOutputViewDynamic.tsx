import { Text } from "ink";
import { memo } from "react";

import { formatToolOutput } from "../utils/format";

import type { ToolInvocationUIPart } from "./ToolCallPartView";

export const ToolOutputViewDynamic = memo(
  ({ part }: { part: ToolInvocationUIPart }) => {
    // Check if output is available (state indicates completion)
    const hasOutput = part.state === "output-available" || part.state === "output-error";

    if (!hasOutput) return null;

    if (part.errorText) {
      return <Text color="red">{part.errorText}</Text>;
    }

    const toolName = part.toolName || part.type.slice(5);

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
