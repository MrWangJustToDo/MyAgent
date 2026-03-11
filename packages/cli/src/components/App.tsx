import { Box } from "ink";

import { useArgs } from "../hooks/useArgs.js";

import { Agent } from "./Agent.js";
import { Help } from "./Help.js";

export const App = () => {
  // Use selector to get specific state (reactive)
  const config = useArgs((s) => s.config);
  const helpRequested = useArgs((s) => s.helpRequested);

  // Extract current options for help display
  const currentOptions = {
    url: config.url,
    model: config.model,
    path: config.rootPath,
    system: config.systemPrompt,
  };

  // If help is requested, show help with current options
  if (helpRequested) {
    return (
      <Box flexDirection="column">
        <Help currentOptions={currentOptions} />
      </Box>
    );
  }

  // Default: run agent
  return (
    <Box flexDirection="column">
      <Agent />
    </Box>
  );
};
