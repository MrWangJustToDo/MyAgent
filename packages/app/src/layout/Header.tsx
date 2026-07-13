import { Box, Text } from "ink";
import { useEffect, useMemo } from "react";

import { FullBox } from "../components/FullBox";
import { useStatic } from "../hooks/use-static";
import { COLORS } from "../theme/colors.js";
import { GRADIENT_STOPS, interpolateColor } from "../utils/gradient.js";

// ============================================================================
// ASCII Logo
// ============================================================================

// prettier-ignore
const LOGO_LINES = [
  " █▀▄▀█ █ █   ▄▀█ █▀▀ █▀▀ █▄ █ ▀█▀",
  " █ ▀ █ ▀▄▀   █▀█ █▄█ ██▄ █ ▀█  █ ",
];

// ============================================================================
// GradientText — per-character horizontal gradient using only <Text>
// ============================================================================

const GradientLine = ({
  text,
  stops,
  rowOffset,
}: {
  text: string;
  stops: string[] | readonly string[];
  rowOffset: number;
}) => {
  const chars = useMemo(() => {
    const totalLen = LOGO_LINES[0].length;
    return [...text].map((ch, i) => ({
      ch,
      color: ch.trim() ? interpolateColor(stops, (i + rowOffset * 0.3) / totalLen) : undefined,
    }));
  }, [text, stops, rowOffset]);

  return (
    <Text>
      {chars.map((c, i) => (
        <Text key={i} color={c.color}>
          {c.ch}
        </Text>
      ))}
    </Text>
  );
};

// ============================================================================
// Logo Component
// ============================================================================

const Logo = () => {
  return (
    <Box flexDirection="column" alignItems="center" width="100%">
      <Box flexDirection="column">
        {LOGO_LINES.map((line, i) => (
          <GradientLine key={i} text={line} stops={GRADIENT_STOPS} rowOffset={i} />
        ))}
      </Box>

      <Box marginTop={1}>
        <Text color={COLORS.accent} italic>
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
  { key: "Ctrl+E", desc: "workspace" },
  { key: "Ctrl+T", desc: "task panel" },
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
              <Text color={COLORS.muted}>{tip.key}</Text>
              <Text color={COLORS.muted} dimColor>
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
