import { Text } from "ink";

import { Spinner } from "../components/Spinner.js";

import type { ToolCallState } from "../utils/toolState.js";

export interface ToolStatusIconProps {
  state: ToolCallState;
}

/** Get status icon for tool call */
export const ToolStatusIcon = ({ state }: ToolStatusIconProps) => {
  switch (state) {
    case "awaiting-input":
    case "input-streaming":
      return <Spinner text="" />;
    case "input-complete":
      return <Text color="cyan">...</Text>;
    case "approval-requested":
      return <Text color="yellow">?</Text>;
    case "approval-responded":
      return <Text color="green">✓</Text>;
    default:
      return null;
  }
};
