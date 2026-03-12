import { Box, Text } from "ink";

import { useArgs } from "../hooks";
import { useHeight } from "../hooks/useHeight";

const LOGO = `
  __  __            _                    _   
 |  \\/  |_   _     / \\   __ _  ___ _ __ | |_ 
 | |\\/| | | | |   / _ \\ / _\` |/ _ \\ '_ \\| __|
 | |  | | |_| |  / ___ \\ (_| |  __/ | | | |_ 
 |_|  |_|\\__, | /_/   \\_\\__, |\\___|_| |_|\\__|
         |___/         |___/                 
`.trim();

export const Header = () => {
  const { model, path } = useArgs((s) => ({ model: s.config.model, path: s.config.rootPath }));

  return (
    <Box flexDirection="column" ref={useHeight.getActions().setHeader}>
      {/* Logo */}
      <Box>
        <Text color="cyan">{LOGO}</Text>
      </Box>

      {/* Info bar */}
      <Box marginTop={1} gap={2}>
        <Box>
          <Text color="gray">Model: </Text>
          <Text color="yellow">{model}</Text>
        </Box>
        <Box>
          <Text color="gray">Path: </Text>
          <Text color="blue">{path}</Text>
        </Box>
      </Box>

      {/* Separator */}
      <Box>
        <Text color="gray" dimColor>
          {"─".repeat(60)}
        </Text>
      </Box>
    </Box>
  );
};
