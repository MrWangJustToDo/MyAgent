import { agentManager } from "@my-agent/core";
import { useEffect, useState } from "react";
import { toRaw } from "reactivity-store";

import { useAgent } from "./use-agent.js";

import type { ManagedAgent } from "@my-agent/core";

/** Look up the subagent for a parent task tool call via `parentTaskId`. */
const getManagerSubagent = (taskId: string): ManagedAgent | undefined => {
  const parentId = useAgent.getReadonlyState().agent?.id;
  if (!parentId || !taskId) return;

  const fromSnapshot = useAgent
    .getReadonlyState()
    .session?.getSnapshot()
    .subagents.find((entry) => entry.parentTaskToolCallId === taskId);
  if (fromSnapshot) {
    return agentManager.getAgent(fromSnapshot.id);
  }

  return agentManager.getSubagents(parentId).find((managed) => managed.parentTaskId === taskId);
};

export const useSubAgents = ({ taskId }: { taskId: string }) => {
  const parentSession = toRaw(useAgent((s) => s.session));
  const [agent, setAgent] = useState<ManagedAgent | undefined>(() => getManagerSubagent(taskId));

  useEffect(() => {
    const existing = getManagerSubagent(taskId);
    if (existing) {
      setAgent(existing);
      return;
    }

    if (!parentSession) return;

    return parentSession.subscribe(
      (event) => {
        if (event.channel !== "lifecycle") return;
        if (event.payload.type !== "subagent:created") return;
        const managed = agentManager.getAgent(event.payload.agentId);
        if (managed?.parentTaskId === taskId) {
          setAgent(managed);
        }
      },
      { channels: ["lifecycle"] }
    );
  }, [taskId, parentSession]);

  return agent;
};
