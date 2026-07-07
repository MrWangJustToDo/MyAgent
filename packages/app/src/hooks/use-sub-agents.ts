import { agentManager } from "@my-agent/core";
import { useEffect, useState } from "react";

import { useAgent } from "./use-agent.js";

import type { ManagedAgent } from "@my-agent/core";

const getManagerSubagent = (subId: string): ManagedAgent | undefined => {
  const id = useAgent.getReadonlyState().agent?.id;
  if (!id) return;

  return agentManager.getSubagents(id).find((managed) => managed.id === subId);
};

export const useSubAgents = ({ subId }: { subId: string }) => {
  const [agent, setAgent] = useState<ManagedAgent | undefined>(() => getManagerSubagent(subId));

  useEffect(() => {
    const existing = getManagerSubagent(subId);
    if (existing) {
      setAgent(existing);
      return;
    }

    return agentManager.on("subagent:created", (event) => {
      if (event.agentId !== subId) return;
      const managed = agentManager.getAgent(subId);
      if (managed) setAgent(managed);
    });
  }, [subId]);

  return agent;
};
