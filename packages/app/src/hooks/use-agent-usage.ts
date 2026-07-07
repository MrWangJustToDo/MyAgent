import { agentManager } from "@my-agent/core";
import { useEffect } from "react";
import { createState } from "reactivity-store";

import { useAgent } from "./use-agent.js";

import type { ManagedAgent, TokenUsage } from "@my-agent/core";

export interface AgentUsageSnapshot {
  total: TokenUsage;
  window: TokenUsage;
  percent: number;
  cost: number;
}

export interface AgentUsageView {
  version: number;
  agent: ManagedAgent | null;
  usage: AgentUsageSnapshot | null;
}

const readUsage = (agent: NonNullable<ReturnType<typeof useAgent.getReadonlyState>["agent"]>): AgentUsageSnapshot => {
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
  const agent = useAgent((s) => s.agent);
  const version = usageState((s) => s.version);

  useEffect(() => {
    if (!agent) return;

    const bump = () => usageState.getActions().bump();
    const agentId = agent.id;
    const unsubStop = agentManager.on("agent:stop", (event) => {
      if (event.agentId === agentId) bump();
    });
    const unsubSubmit = agentManager.on("prompt:submit", (event) => {
      if (event.agentId === agentId) bump();
    });

    return () => {
      unsubStop();
      unsubSubmit();
    };
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
