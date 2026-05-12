import { Box, Text } from "ink";
import { useEffect } from "react";

import { FullBox } from "../components/FullBox";
import { useArgs } from "../hooks";
import { useAgentSandbox } from "../hooks/use-agent-sandbox";
import { useStatic } from "../hooks/use-static";

export const Header = () => {
  const { model, path } = useArgs((s) => ({ model: s.config.model, path: s.config.rootPath }));

  const name = useAgentSandbox((s) => s.sandbox?.provider);

  useEffect(() => {
    if (!model || !path || !name) return;

    useStatic.getActions().setStaticHeader(
      <FullBox
        flexDirection="column"
        key="header"
        marginBottom={1}
        borderStyle="round"
        borderColor="cyan"
        paddingX={2}
        paddingY={1}
      >
        {/* Logo line */}
        <Box>
          <Text color="yellow">⚡</Text>
          <Text> </Text>
          <Text bold color="cyan">
            My
          </Text>
          <Text bold color="magenta">
            Agent
          </Text>
          <Text color="gray">  —  AI Coding Agent</Text>
        </Box>

        {/* Info bar */}
        <Box gap={2}>
          <Box>
            <Text color="gray">Model: </Text>
            <Text color="yellow" wrap="truncate-end">
              {model}
            </Text>
          </Box>
          <Box>
            <Text color="gray">Sandbox: </Text>
            <Text color="green" wrap="truncate-end">
              {name || "..."}
            </Text>
          </Box>
          <Box>
            <Text color="gray">Path: </Text>
            <Text color="blue" wrap="truncate-end">
              {path}
            </Text>
          </Box>
        </Box>
      </FullBox>
    );
  }, [model, path, name]);

  return null;
};
