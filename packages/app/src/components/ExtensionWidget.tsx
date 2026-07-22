import { Box, Text } from "ink";

import { COLORS } from "../theme/colors.js";

import type { ReactNode } from "react";

const WIDGET_RENDERERS: Record<string, (props: Record<string, unknown>) => ReactNode> = {
  "progress-bar": (props) => {
    const current = Number(props.current) || 0;
    const total = Number(props.total) || 1;
    const pct = Math.min(100, Math.round((current / total) * 100));
    const bar = "█".repeat(Math.floor(pct / 10)) + "░".repeat(10 - Math.floor(pct / 10));
    return (
      <Text color={COLORS.accent}>
        {bar} {pct}%
      </Text>
    );
  },
  label: (props) => (
    <Text color={COLORS.muted} dimColor>
      {String(props.text ?? "")}
    </Text>
  ),
};

export const ExtensionWidget = ({
  widgets,
}: {
  widgets: ReadonlyArray<{ readonly id: string; readonly component: string; readonly props: Record<string, unknown> }>;
}) => {
  if (widgets.length === 0) return null;

  return (
    <Box flexDirection="column" paddingX={1}>
      {widgets.map((w) => (
        <Box key={w.id} gap={1}>
          <Text color={COLORS.muted} dimColor>
            ext:
          </Text>
          {WIDGET_RENDERERS[w.component]?.(w.props) ?? (
            <Text color={COLORS.muted} dimColor>
              {w.component}
            </Text>
          )}
        </Box>
      ))}
    </Box>
  );
};
