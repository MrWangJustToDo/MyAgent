import { useEffect } from "react";
import { createState, toRaw } from "reactivity-store";

import { useAgent } from "./use-agent.js";

import type { TokenUsage } from "@my-agent/core";

type AgentRef = NonNullable<ReturnType<typeof useAgent.getReadonlyState>["agent"]>;

export interface AgentUsageSnapshot {
  total: TokenUsage;
  window: TokenUsage;
  percent: number;
  cost: number;
}

export interface AgentUsageView {
  version: number;
  agent: AgentRef | null;
  usage: AgentUsageSnapshot | null;
}

const readUsage = (agent: AgentRef): AgentUsageSnapshot => {
  const tracker = agent.usage;
  return {
    total: { ...tracker.getTotal() },
    window: { ...tracker.getWindowUsage() },
    percent: tracker.getTokenLimitPercent(),
    cost: tracker.getTotalCostUsd(),
  };
};

const usageState = createState(() => ({ version: 0 }), {
  withActions: (s) => ({
    bump: () => {
      s.version++;
    },
  }),
  withNamespace: "useAgentUsage",
});

/** Reactive view of {@link ManagedAgent.usage} for footer and slash commands. */
export const useAgentUsage = (): AgentUsageView => {
  const agent = toRaw(useAgent((s) => s.agent));
  const version = usageState((s) => s.version);

  useEffect(() => {
    if (!agent) return;

    const bump = () => usageState.getActions().bump();
    return agent.observe({
      events: ["agent:stop", "prompt:submit"],
      onEvent: bump,
    });
  }, [agent]);

  if (!agent) {
    return { version, agent: null, usage: null };
  }

  return {
    version,
    agent,
    usage: readUsage(agent),
  };
};

export const bumpAgentUsage = (): void => {
  usageState.getActions().bump();
};
