import { getEnv } from "@my-agent/core";
import { Box, Text } from "ink";
import { useEffect, useMemo } from "react";

import { FullBox } from "../components/FullBox";
import { useStatic } from "../hooks/use-static";
import { COLORS } from "../theme/colors.js";
import { GRADIENT_STOPS, interpolateColor } from "../utils/gradient.js";
import { fetchWorkspaceGitInfo, type WorkspaceGitInfo } from "../utils/workspace-git-info.js";

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
// Git line
// ============================================================================

const GitInfoLine = ({ git }: { git: WorkspaceGitInfo }) => {
  const showSha = Boolean(git.shortSha) && !git.branch.includes(git.shortSha);

  return (
    <Box marginTop={1} gap={1} justifyContent="center" width="100%">
      <Text color={COLORS.muted} dimColor>
        git
      </Text>
      <Text color={COLORS.primary}>
        {git.branch}
        {git.dirty ? "*" : ""}
      </Text>
      {showSha && (
        <Text color={COLORS.muted} dimColor>
          · {git.shortSha}
        </Text>
      )}
    </Box>
  );
};

function buildHeader(git: WorkspaceGitInfo | null) {
  return (
    <FullBox flexDirection="column" key="header" marginBottom={1} paddingX={3} paddingY={1}>
      <Logo />
      {git && <GitInfoLine git={git} />}

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
}

// ============================================================================
// Header Component
// ============================================================================

export const Header = () => {
  useEffect(() => {
    let cancelled = false;

    const publish = async () => {
      let git: WorkspaceGitInfo | null = null;
      try {
        const rootPath = getEnv().rootPath;
        git = await fetchWorkspaceGitInfo(rootPath);
      } catch {
        git = null;
      }
      if (cancelled) return;
      useStatic.getActions().setStaticHeader(buildHeader(git));
    };

    void publish();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
};
