import { agentManager } from "@my-agent/core";
import { useEffect, useState } from "react";

import { useAgent } from "./use-agent.js";

import type { Agent } from "@my-agent/core";

const getManagerSubagent = (subId: string) => {
  const id = useAgent.getReadonlyState().agent?.id;

  if (!id) return;

  const allSub = agentManager.getSubagents(id);

  const managerAgent = allSub.find((i) => i.id === subId);

  return managerAgent;
};

export const useSubAgents = ({ subId }: { subId: string }) => {
  const [agent, setAgent] = useState<Agent | undefined>(() => getManagerSubagent(subId)?.agent as undefined | Agent);

  useEffect(() => {
    const agent = getManagerSubagent(subId)?.agent;

    if (agent) {
      setAgent(agent);
    } else {
      const cb = agentManager.on("subagent:created", (event) => {
        const subagentId = event.agentId;
        const managerAgent = agentManager.getAgent(subagentId);
        if (managerAgent?.id === subId) {
          setAgent(managerAgent.agent);
        }
      });

      return cb;
    }
  }, [subId]);

  return agent;
};
