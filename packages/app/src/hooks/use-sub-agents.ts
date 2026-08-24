import { useEffect, useState } from "react";
import { toRaw } from "reactivity-store";

import { getActiveSession } from "../utils/session-resolve.js";

import { useAgent } from "./use-agent.js";

import type { AgentSessionSubagentSummary } from "@my-agent/core";

function findSubagentByTask(taskId: string): AgentSessionSubagentSummary | undefined {
  if (!taskId) return undefined;
  return getActiveSession()
    ?.getSnapshot()
    .subagents.find((entry) => entry.parentTaskToolCallId === taskId);
}

/** Resolve the subagent summary for a parent task tool call (Session snapshot). */
export const useSubAgents = ({ taskId }: { taskId: string }) => {
  const parentSession = toRaw(useAgent((s) => s.session));
  const [subagent, setSubagent] = useState<AgentSessionSubagentSummary | undefined>(() => findSubagentByTask(taskId));

  useEffect(() => {
    const existing = findSubagentByTask(taskId);
    if (existing) {
      setSubagent(existing);
    }

    if (!parentSession) return;

    return parentSession.subscribe(
      (event) => {
        if (event.channel === "lifecycle") {
          if (
            event.payload.type === "subagent:created" ||
            event.payload.type === "subagent:started" ||
            event.payload.type === "subagent:phase" ||
            event.payload.type === "subagent:completed" ||
            event.payload.type === "subagent:destroyed"
          ) {
            setSubagent(findSubagentByTask(taskId));
          }
          return;
        }
        if (event.channel === "state") {
          setSubagent(findSubagentByTask(taskId));
        }
      },
      { channels: ["lifecycle", "state"] }
    );
  }, [taskId, parentSession]);

  return subagent;
};
