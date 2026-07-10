import { agentManager } from "@my-agent/core";
import { useEffect, useState } from "react";

import { useAgent } from "./use-agent.js";

import type { ManagedAgent } from "@my-agent/core";

const getManagerSubagent = (subId: string, taskId: string): ManagedAgent | undefined => {
  const id = useAgent.getReadonlyState().agent?.id;
  if (!id) return;

  return agentManager.getSubagents(id).find((managed) => managed.id === subId || managed.parentTaskId === taskId);
};

export const useSubAgents = ({ subId, taskId }: { subId: string; taskId: string }) => {
  const [agent, setAgent] = useState<ManagedAgent | undefined>(() => getManagerSubagent(subId, taskId));

  useEffect(() => {
    const existing = getManagerSubagent(subId, taskId);
    if (existing) {
      setAgent(existing);
      return;
    }

    return agentManager.on("subagent:created", (event) => {
      if (event.agentId !== subId) return;
      const managed = agentManager.getAgent(subId);
      if (managed) setAgent(managed);
    });
  }, [subId, taskId]);

  return agent;
};
