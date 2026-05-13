import { Box, Text } from "ink";
import BigText from "ink-big-text";
import Gradient from "ink-gradient";
import { useEffect } from "react";

import { FullBox } from "../components/FullBox";
import { useArgs } from "../hooks";
import { useAgentSandbox } from "../hooks/use-agent-sandbox";
import { useStatic } from "../hooks/use-static";

// ============================================================================
// Logo Config
// ============================================================================

const GRADIENT_COLORS: [string, string, string] = ["#00D4FF", "#7B61FF", "#FF6B9D"];

const LOGO_FONT = "simple";

// ============================================================================
// Logo Component
// ============================================================================

const Logo = () => {
  return (
    <Box flexDirection="column" alignItems="center" width="100%">
      {/* Gradient big text logo */}
      <Gradient colors={GRADIENT_COLORS}>
        <BigText text="MyAgent" font={LOGO_FONT} letterSpacing={2} space={false} />
      </Gradient>

      {/* Tagline */}
      <Box marginTop={-1}>
        <Text color="#6366F1" italic>
          AI-Powered Coding Agent
        </Text>
      </Box>
    </Box>
  );
};

// ============================================================================
// Status Dot
// ============================================================================

const StatusDot = ({ color }: { color: string }) => (
  <Text color={color} bold>
    ●
  </Text>
);

// ============================================================================
// Header Component
// ============================================================================

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
        // borderStyle="round"
        // borderColor="#334155"
        paddingX={3}
        paddingY={1}
      >
        {/* Logo */}
        <Logo />

        {/* Divider */}
        {/* <Box marginY={1}>
          <Text color="#334155">{"─".repeat(48)}</Text>
        </Box> */}
        <Box height={1} />

        {/* Info bar */}
        <Box gap={3} justifyContent="center" width="100%">
          <Box>
            <StatusDot color="#00D4FF" />
            <Text> </Text>
            <Text color="#A1A1AA" dimColor>
              Model
            </Text>
            <Text> </Text>
            <Text color="#E4E4E7" bold wrap="truncate-end">
              {model}
            </Text>
          </Box>

          <Box>
            <StatusDot color="#7B61FF" />
            <Text> </Text>
            <Text color="#A1A1AA" dimColor>
              Sandbox
            </Text>
            <Text> </Text>
            <Text color="#E4E4E7" wrap="truncate-end">
              {name}
            </Text>
          </Box>

          <Box>
            <StatusDot color="#22D3EE" />
            <Text> </Text>
            <Text color="#A1A1AA" dimColor>
              Path
            </Text>
            <Text> </Text>
            <Text color="#E4E4E7" wrap="truncate-end">
              {path}
            </Text>
          </Box>
        </Box>
      </FullBox>
    );
  }, [model, path, name]);

  return null;
};
