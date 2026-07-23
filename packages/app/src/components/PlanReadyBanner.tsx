import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import { toRaw } from "reactivity-store";

import { useAgent } from "../hooks/use-agent.js";
import { COLORS } from "../theme/colors.js";

import type { ManagedAgent } from "@my-agent/core";

/**
 * Visible ready-state affordances above the footer (execute / revise / exit).
 */
export const PlanReadyBanner = () => {
  const agent = useAgent((s) => s.agent) as ManagedAgent | null;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!agent) return;
    return toRaw(agent).observe({
      onState: () => setTick((n) => n + 1),
    });
  }, [agent]);

  if (tick < 0 || !agent) return null;

  const plan = agent.getPlanModeState();
  if (plan.phase !== "ready") return null;

  const steps = plan.steps.length;
  const preserved = plan.preservedExistingTodos ? " · existing todos kept until execute" : "";

  return (
    <Box flexDirection="column" paddingX={1} paddingTop={1}>
      <Text color={COLORS.accent} bold>
        Plan ready{steps > 0 ? ` (${steps} steps)` : ""}
        {preserved}
      </Text>
      <Text color={COLORS.muted} dimColor>
        /plan execute to build · /plan save · revise in chat · /plan to exit
      </Text>
    </Box>
  );
};
