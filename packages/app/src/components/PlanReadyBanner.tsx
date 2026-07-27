import { Box, Text } from "ink";
import { StreamMarkdown } from "ink-stream-markdown";
import { useEffect, useState } from "react";
import { toRaw } from "reactivity-store";

import { useAgent } from "../hooks/use-agent.js";
import { usePlanPreview } from "../hooks/use-plan-preview.js";
import { useSize } from "../hooks/use-size.js";
import { COLORS } from "../theme/colors.js";
import { markdownTheme } from "../theme/markdown-theme.js";
import { KeyLabel } from "../utils/keyboard-labels.js";

import type { ManagedAgent } from "@my-agent/core";

/**
 * Ready-state banner: Build/revise hints + optional full-plan markdown preview.
 * Toggle preview with {@link KeyLabel.p} when the chat input is empty (wired in keybindings).
 */
export const PlanReadyBanner = () => {
  const agent = useAgent((s) => s.agent) as ManagedAgent | null;
  const [tick, setTick] = useState(0);
  const previewOpen = usePlanPreview((s) => s.open);
  const width = useSize((s) => s.state.screenWidth);

  useEffect(() => {
    if (!agent) return;
    return toRaw(agent).observe({
      onState: () => setTick((n) => n + 1),
    });
  }, [agent]);

  useEffect(() => {
    if (tick < 0 || !agent) return;
    const phase = agent.getPlanModeState().phase;
    if (phase !== "ready" && previewOpen) {
      usePlanPreview.getActions().hide();
    }
  }, [agent, tick, previewOpen]);

  if (tick < 0 || !agent) return null;

  const plan = agent.getPlanModeState();
  if (plan.phase !== "ready") return null;

  const steps = plan.steps.length;
  const path = plan.planFilePath ? ` · ${plan.planFilePath}` : "";
  const preserved = plan.preservedExistingTodos ? " · existing todos kept until Build" : "";
  const markdown = plan.planMarkdown?.trim() || "";
  const previewWidth = Math.max(40, width - 4);

  return (
    <Box flexDirection="column" paddingX={1} paddingTop={1} gap={1}>
      <Box flexDirection="column">
        <Text color={COLORS.accent} bold>
          Plan ready for review{steps > 0 ? ` (${steps} steps)` : ""}
          {path}
          {preserved}
        </Text>
        <Text color={COLORS.muted} dimColor>
          {KeyLabel.p} review plan · /plan execute to Build · /plan save · revise in chat · /plan to exit
          {previewOpen ? ` · ${KeyLabel.esc} close preview` : ""}
        </Text>
      </Box>

      {previewOpen && (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor={COLORS.accent}
          paddingX={1}
          paddingY={0}
          width={previewWidth}
        >
          {markdown ? (
            <StreamMarkdown theme={{ ...markdownTheme, width: previewWidth - 4 }}>{markdown}</StreamMarkdown>
          ) : (
            <Text color={COLORS.muted} dimColor>
              No plan markdown available
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
};
