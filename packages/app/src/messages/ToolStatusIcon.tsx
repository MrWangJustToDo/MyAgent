import { Text } from "ink";

import { Spinner } from "../components/Spinner.js";

import type { ToolUIPart } from "ai";

export interface ToolStatusIconProps {
  state: ToolUIPart["state"];
}

/** Get status icon for tool invocation */
export const ToolStatusIcon = ({ state }: ToolStatusIconProps) => {
  switch (state) {
    case "input-streaming":
    case "input-available":
    case "approval-responded":
      return <Spinner text="" />;
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
