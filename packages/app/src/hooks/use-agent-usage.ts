import { useEffect, useState } from "react";
import { createState, toRaw } from "reactivity-store";

import { useAgent } from "./use-agent.js";

import type { AgentSession, TokenUsage, UsageChangeSnapshot } from "@my-agent/core";

export interface AgentUsageSnapshot {
  total: TokenUsage;
  window: TokenUsage;
  percent: number;
  tokenLimit: number;
  cost: number;
}

export interface AgentUsageView {
  version: number;
  session: AgentSession | null;
  usage: AgentUsageSnapshot | null;
}

const toView = (snap: UsageChangeSnapshot): AgentUsageSnapshot => ({
  total: { ...snap.total },
  window: { ...snap.window },
  percent: snap.percent,
  tokenLimit: snap.tokenLimit,
  cost: snap.cost,
});

const usageState = createState(() => ({ version: 0 }), {
  withActions: (s) => ({
    bump: () => {
      s.version++;
    },
  }),
  withNamespace: "useAgentUsage",
});

/** Reactive view of session usage for footer and slash commands. */
export const useAgentUsage = (): AgentUsageView => {
  const session = toRaw(useAgent((s) => s.session));
  const version = usageState((s) => s.version);
  const [usage, setUsage] = useState<AgentUsageSnapshot | null>(() => {
    if (!session) return null;
    return toView(session.getSnapshot().usage);
  });

  useEffect(() => {
    if (!session) {
      setUsage(null);
      return;
    }

    setUsage(toView(session.getSnapshot().usage));
    return session.subscribe(
      (event) => {
        if (event.channel !== "usage") return;
        // Reactive update only — do NOT bump version here. `version` marks a
        // session identity change (resume/clear/compact, via bumpAgentUsage),
        // not every token increment; bumping here would remount AnimateNumber
        // and kill the footer token animation.
        setUsage(toView(event.payload));
      },
      { channels: ["usage"] }
    );
  }, [session]);

  return {
    version,
    session,
    usage,
  };
};

export const bumpAgentUsage = (): void => {
  usageState.getActions().bump();
};
