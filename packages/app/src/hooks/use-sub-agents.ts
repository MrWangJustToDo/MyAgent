import { agentManager } from "@my-agent/core";
import { useEffect, useState } from "react";
import { toRaw } from "reactivity-store";

import { useAgent } from "./use-agent.js";

import type { ManagedAgent } from "@my-agent/core";

/** Look up the subagent for a parent task tool call via `parentTaskId`. */
const getManagerSubagent = (taskId: string): ManagedAgent | undefined => {
  const id = useAgent.getReadonlyState().agent?.id;
  if (!id || !taskId) return;

  return agentManager.getSubagents(id).find((managed) => managed.parentTaskId === taskId);
};

export const useSubAgents = ({ taskId }: { taskId: string }) => {
  const parent = toRaw(useAgent((s) => s.agent));
  const [agent, setAgent] = useState<ManagedAgent | undefined>(() => getManagerSubagent(taskId));

  useEffect(() => {
    const existing = getManagerSubagent(taskId);
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
  }, [taskId, parent]);

  return agent;
};
