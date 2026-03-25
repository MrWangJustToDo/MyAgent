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
      return <Spinner text="" />;
    case "input-available":
      return <Text color="cyan">...</Text>;
    case "output-available":
      return <Text color="green">✓</Text>;
    case "output-error":
      return <Text color="red">x</Text>;
    case "approval-requested":
      return <Text color="yellow">?</Text>;
    case "approval-responded":
      return <Text color="cyan">...</Text>;
    case "output-denied":
      return <Text color="red">x</Text>;
    default:
      return null;
  }
};
