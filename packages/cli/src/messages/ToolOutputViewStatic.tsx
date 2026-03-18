import { Text } from "ink";
import { memo } from "react";

import type { ToolInvocationUIPart } from "./ToolCallPartView";

export const ToolOutputViewStatic = memo(
  ({ part }: { part: ToolInvocationUIPart }) => {
    // Check if output is available (state indicates completion)
    const hasOutput = part.state === "output-available" || part.state === "output-error";

    if (!hasOutput) return null;

    if (part.errorText) {
      return <Text color="red">{part.errorText}</Text>;
    }

    const output = part.output as { message?: string };

    return <Text>{output.message}</Text>;
  },
  (p, c) => {
    const pOutput = p.part.output;
    const cOutput = c.part.output;
    return pOutput === cOutput;
  }
);

ToolOutputViewStatic.displayName = "ToolOutputViewStatic";
