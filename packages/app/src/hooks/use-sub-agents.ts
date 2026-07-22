import { agentManager } from "@my-agent/core";
import { useEffect, useState } from "react";
import { toRaw } from "reactivity-store";

import { useAgent } from "./use-agent.js";

import type { ManagedAgent } from "@my-agent/core";

const getManagerSubagent = (subId: string, taskId: string): ManagedAgent | undefined => {
  const id = useAgent.getReadonlyState().agent?.id;
  if (!id) return;

  return agentManager.getSubagents(id).find((managed) => managed.id === subId || managed.parentTaskId === taskId);
};

export const useSubAgents = ({ subId, taskId }: { subId: string; taskId: string }) => {
  const parent = toRaw(useAgent((s) => s.agent));
  const [agent, setAgent] = useState<ManagedAgent | undefined>(() => getManagerSubagent(subId, taskId));

  useEffect(() => {
    const existing = getManagerSubagent(subId, taskId);
    if (existing) {
      setAgent(existing);
      return;
    }

    if (!parent) return;

    return parent.observe({
      events: ["subagent:created"],
      onEvent: (event) => {
        const managed = agentManager.getAgent(event.agentId);
        if (managed?.parentTaskId === taskId) {
          setAgent(managed);
        }
      },
    });
  }, [subId, taskId, parent]);

  return agent;
};
