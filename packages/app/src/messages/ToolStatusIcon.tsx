import { getToolName, type ToolUIPart } from "ai";
import { Text } from "ink";

import { Spinner } from "../components/Spinner.js";
import { COLORS } from "../theme/colors.js";

export interface ToolStatusIconProps {
  part: ToolUIPart;
  state: ToolUIPart["state"];
}

/** Get status icon for tool invocation */
export const ToolStatusIcon = ({ state, part }: ToolStatusIconProps) => {
  const toolName = getToolName(part);
  switch (state) {
    case "input-streaming":
    case "input-available":
    case "approval-responded":
      return toolName === "ask_user" ? <Text color={COLORS.warning}>?</Text> : <Spinner text="" />;
    case "output-available":
      return <Text color={COLORS.success}>✓</Text>;
    case "output-error":
    case "output-denied":
      return <Text color={COLORS.danger}>✗</Text>;
    case "approval-requested":
      return <Text color={COLORS.warning}>?</Text>;
    default:
      return null;
  }
};
