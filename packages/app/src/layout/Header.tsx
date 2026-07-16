import { Box, Text } from "ink";
import { useEffect, useMemo } from "react";

import { FullBox } from "../components/FullBox";
import { useSize } from "../hooks/use-size.js";
import { useStatic } from "../hooks/use-static";
import { useWorkspaceInfo } from "../hooks/use-workspace-info";
import { COLORS } from "../theme/colors.js";
import { getGradientStops, interpolateColor } from "../utils/gradient.js";
import { type WorkspaceGitInfo } from "../utils/workspace-git-info.js";

// ============================================================================
// ASCII Logo
// ============================================================================

// prettier-ignore
const LOGO_LINES = [
  " █▀▄▀█ █ █   ▄▀█ █▀▀ █▀▀ █▄ █ ▀█▀",
  " █ ▀ █ ▀▄▀   █▀█ █▄█ ██▄ █ ▀█  █ ",
];

/** Hide workspace/git + tips when the terminal is too narrow to render them on one line. */
const HEADER_META_MIN_WIDTH = 80;

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
          <GradientLine key={i} text={line} stops={getGradientStops()} rowOffset={i} />
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
// Git / workspace line
// ============================================================================

/** Single-line meta row — no flex children that wrap mid-token at narrow widths. */
const GitInfoLine = ({ git, workspacePath }: { git: WorkspaceGitInfo | null; workspacePath: string }) => {
  const showSha = Boolean(git?.shortSha) && git != null && !git.branch.includes(git.shortSha);
  const branch = git ? `${git.branch}${git.dirty ? "*" : ""}` : "";

  return (
    <Box marginTop={1} justifyContent="center" width="100%" flexShrink={0}>
      <Text wrap="truncate">
        {workspacePath ? (
          <Text color={COLORS.muted} dimColor>
            {workspacePath}
          </Text>
        ) : null}
        {workspacePath && git ? (
          <Text color={COLORS.muted} dimColor>
            {" · "}
          </Text>
        ) : null}
        {git ? (
          <>
            <Text color={COLORS.muted} dimColor>
              git{" "}
            </Text>
            <Text color={COLORS.primary}>{branch}</Text>
            {showSha ? (
              <Text color={COLORS.muted} dimColor>
                {" · "}
                {git.shortSha}
              </Text>
            ) : null}
          </>
        ) : null}
      </Text>
    </Box>
  );
};

function buildHeader(git: WorkspaceGitInfo | null, workspacePath: string, showMeta: boolean) {
  return (
    <FullBox flexDirection="column" key="header" marginBottom={1} paddingX={3} paddingY={1}>
      <Logo />
      {showMeta && (workspacePath || git) && <GitInfoLine git={git} workspacePath={workspacePath} />}

      {showMeta && (
        <>
          <Box height={1} />

          {/* Tips bar — only when wide enough to keep each tip on one line */}
          <Box gap={3} justifyContent="center" width="100%" flexShrink={0}>
            {TIPS.map((tip, i) => (
              <Box key={i} gap={1} flexShrink={0}>
                <Text color={COLORS.muted}>{tip.key}</Text>
                <Text color={COLORS.muted} dimColor>
                  {tip.desc}
                </Text>
              </Box>
            ))}
          </Box>
        </>
      )}
    </FullBox>
  );
}

// ============================================================================
// Header Component
// ============================================================================

export const Header = () => {
  const screenWidth = useSize((s) => s.state.screenWidth);
  const { git, path: workspacePath } = useWorkspaceInfo((s) => s.workspaceInfo);

  useEffect(() => {
    if (!workspacePath) return;
    const showMeta = screenWidth >= HEADER_META_MIN_WIDTH;
    useStatic.getActions().setStaticHeader(buildHeader(git || null, workspacePath, showMeta));
  }, [git, workspacePath, screenWidth]);

  return null;
};
