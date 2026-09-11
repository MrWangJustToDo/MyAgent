import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import { toRaw } from "reactivity-store";

import { LLMUsage } from "../components/LLMUsage.js";
import { useAgentUsage } from "../hooks/use-agent-usage.js";
import { useAgent } from "../hooks/use-agent.js";
import { useConfig } from "../hooks/use-config.js";
import { COLORS } from "../theme/colors.js";
import { formatStatusBarModeLabel } from "../utils/agent-mode-label.js";

/**
 * Bottom status bar — mode, usage, model.
 *
 * Subscribes to `state` / `plan` / `todos` / `mode` so plan phase / auto mode /
 * todos changes re-read the live snapshot (local sessions read `getSnapshot()`
 * directly; remote caches only update via the `mode` channel).
 */
export const FooterStatusBar = () => {
  const model = useConfig((s) => s.config.serverModel || s.config.model);
  const { version } = useAgentUsage();
  const session = toRaw(useAgent((s) => s.session));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!session) return;
    return session.subscribe(
      () => {
        setTick((n) => n + 1);
      },
      { channels: ["state", "plan", "todos", "mode"] }
    );
  }, [session]);

  // tick forces re-read when plan phase / auto mode / todos change
  void tick;

  const modeLabel = formatStatusBarModeLabel(session?.getSnapshot());
  const isDefault = modeLabel === "Normal";
  const modeColor = isDefault ? COLORS.muted : COLORS.accent;

  return (
    <Box justifyContent="space-between" paddingX={1}>
      <Box gap={2} flexShrink={1}>
        <Text color={modeColor} dimColor={isDefault} bold={!isDefault} wrap="truncate">
          {modeLabel}
        </Text>
      </Box>

      <Box gap={2} flexShrink={0}>
        {/* key=version: remount only when session identity changes (resume/
            clear/compact bump it), so AnimateNumber snaps to the new total
            without animating across session boundaries. */}
        <LLMUsage key={version} />
        {model && (
          <Text color={COLORS.muted} dimColor wrap="truncate">
            {model}
          </Text>
        )}
      </Box>
    </Box>
  );
};
