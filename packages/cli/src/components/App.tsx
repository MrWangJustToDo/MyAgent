import { Box } from "ink";

import { type ParsedArgs, getFlagString } from "../hooks/useArgs.js";

import { Agent } from "./Agent.js";
import { Help } from "./Help.js";

export interface AppProps {
  args: string[];
  showHelp: boolean;
  parsed: ParsedArgs;
}

export const App = ({ args, showHelp, parsed }: AppProps) => {
  // Extract current options for help display
  const currentOptions = {
    url: getFlagString(parsed, "", "u", "url"),
    model: getFlagString(parsed, "", "m", "model"),
    path: getFlagString(parsed, "", "p", "path"),
    system: getFlagString(parsed, "", "s", "system"),
  };

  // If help is requested, show help with current options
  if (showHelp) {
    return (
      <Box flexDirection="column">
        <Help currentOptions={currentOptions} />
      </Box>
    );
  }

  // Default: run agent with all args
  return (
    <Box flexDirection="column">
      <Agent args={args} />
    </Box>
  );
};
