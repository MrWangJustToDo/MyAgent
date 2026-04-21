import { getToolName, type ToolUIPart } from "ai";
import { Text } from "ink";

import { Spinner } from "../components/Spinner";
import { formatToolOutput } from "../utils/format";

export const ToolOutputView = ({ part }: { part: ToolUIPart }) => {
  // Check if output is available (state indicates completion)
  const hasOutput =
    part.state === "output-available" || part.state === "output-error" || part.state === "output-denied";

  if (!hasOutput) return <Spinner />;

  const deniedReason = part.state === "output-denied" ? (part.approval?.reason ?? "Tool execution denied.") : undefined;
  const errorText = part.errorText ?? deniedReason;

  if (errorText) {
    return <Text color="red">{errorText}</Text>;
  }

  const toolName = getToolName(part);

  // Use tool-specific formatter for better output display
  return <Text color="gray">{formatToolOutput(part.output, toolName)}</Text>;
};
