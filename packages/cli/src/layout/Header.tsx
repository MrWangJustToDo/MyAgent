import { Box, Text } from "ink";
import BigText from "ink-big-text";
import Gradient from "ink-gradient";

import { useArgs } from "../hooks";
import { useSandbox } from "../hooks/useSandbox";
import { useSize } from "../hooks/useSize";

export const Header = () => {
  const { model, path } = useArgs((s) => ({ model: s.config.model, path: s.config.rootPath }));

  const name = useSandbox((s) => s.state?.provider);

  return (
    <Box flexDirection="column" ref={useSize.getActions().setHeader} marginBottom={1}>
      {/* Logo */}
      <Gradient name="rainbow">
        <BigText text="My Agent" />
      </Gradient>

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
    </Box>
  );
};
