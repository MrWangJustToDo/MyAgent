import { getToolName, type ToolUIPart } from "ai";
import { Text } from "ink";

import { Spinner } from "../components/Spinner.js";

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
      return toolName === "ask_user" ? <Text color="yellow">?</Text> : <Spinner text="" />;
    case "output-available":
      return <Text color="green">✓</Text>;
    case "output-error":
    case "output-denied":
      return <Text color="red">✗</Text>;
    case "approval-requested":
      return <Text color="yellow">?</Text>;
    default:
      return null;
  }
};
