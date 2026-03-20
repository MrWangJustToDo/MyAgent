import { Box } from "ink";

import { Debug } from "../components/Debug.js";
import { Help } from "../components/Help.js";
import { useArgs } from "../hooks/use-args.js";

import { Agent } from "./Agent.js";

export const App = () => {
  // Use selector to get specific state (reactive)
  const helpRequested = useArgs((s) => s.helpRequested);

  // If help is requested, show help with current options
  if (helpRequested) {
    return (
      <Box flexDirection="column">
        <Help />
      </Box>
    );
  }

  // Default: run agent
  return (
    <Box flexDirection="column">
      <Debug />
      <Agent />
    </Box>
  );
};
