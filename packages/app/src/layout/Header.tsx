import { Box, Text } from "ink";
import { useEffect, useMemo } from "react";

import { FullBox } from "../components/FullBox";
import { useStatic } from "../hooks/use-static";

// ============================================================================
// ASCII Logo
// ============================================================================

// prettier-ignore
const LOGO_LINES = [
  " █▀▄▀█ █ █   ▄▀█ █▀▀ █▀▀ █▄ █ ▀█▀",
  " █ ▀ █ ▀▄▀   █▀█ █▄█ ██▄ █ ▀█  █ ",
];

const GRADIENT_STOPS = ["#00D4FF", "#7B61FF", "#FF6B9D"];

// ============================================================================
// Gradient Utilities
// ============================================================================

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

function interpolateColor(stops: string[], t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const segments = stops.length - 1;
  const segment = Math.min(Math.floor(clamped * segments), segments - 1);
  const local = clamped * segments - segment;
  const [r1, g1, b1] = hexToRgb(stops[segment]);
  const [r2, g2, b2] = hexToRgb(stops[segment + 1]);
  return rgbToHex(
    Math.round(r1 + (r2 - r1) * local),
    Math.round(g1 + (g2 - g1) * local),
    Math.round(b1 + (b2 - b1) * local)
  );
}

// ============================================================================
// GradientText — per-character horizontal gradient using only <Text>
// ============================================================================

const GradientLine = ({ text, stops, rowOffset }: { text: string; stops: string[]; rowOffset: number }) => {
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
