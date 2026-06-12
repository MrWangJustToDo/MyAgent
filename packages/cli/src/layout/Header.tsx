import { Box, Text } from "ink";
import BigText from "ink-big-text";
import Gradient from "ink-gradient";
import { useEffect } from "react";

import { FullBox } from "../components/FullBox";
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
      <Gradient colors={GRADIENT_COLORS}>
        <BigText text="MyAgent" font={LOGO_FONT} letterSpacing={2} space={false} />
      </Gradient>

      <Box marginTop={-1}>
        <Text color="#6366F1" italic>
          AI-Powered Coding Agent
        </Text>
      </Box>
    </Box>
  );
};

// ============================================================================
// Tips
// ============================================================================

const TIPS = [
  { key: "/", desc: "for commands" },
  { key: "Ctrl+V", desc: "paste image" },
  { key: "Esc", desc: "to abort" },
];

// ============================================================================
// Header Component
// ============================================================================

export const Header = () => {
  useEffect(() => {
    useStatic.getActions().setStaticHeader(
      <FullBox flexDirection="column" key="header" marginBottom={1} paddingX={3} paddingY={1}>
        <Logo />

        <Box height={1} />

        {/* Tips bar */}
        <Box gap={3} justifyContent="center" width="100%">
          {TIPS.map((tip, i) => (
            <Box key={i} gap={1}>
              <Text color="gray">{tip.key}</Text>
              <Text color="gray" dimColor>
                {tip.desc}
              </Text>
            </Box>
          ))}
        </Box>
      </FullBox>
    );
  }, []);

  return null;
};
