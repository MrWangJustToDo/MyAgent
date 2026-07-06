import { agentManager } from "@my-agent/core";
import { useEffect, useState } from "react";

import { useSubAgents } from "./use-sub-agents";

import type { Agent, AgentContext } from "@my-agent/core";

type TaskInfo = {
  allTools?: ReturnType<AgentContext["getToolCallHistory"]>;
  total?: number;
  finish?: AgentContext["finishInfo"];
};

const getTaskInfoFromAgent = (agent?: Agent) => {
  const allTools = agent?.context?.getToolCallHistory();
  return {
    allTools,
    total: allTools?.length,
    finish: agent?.context?.finishInfo,
  };
};

export const useTask = ({ id }: { id: string }) => {
  const agent = useSubAgents({ subId: id });

  const [info, setInfo] = useState<TaskInfo>(() => getTaskInfoFromAgent(agent));

  useEffect(() => {
    if (!agent) return;

    const refresh = () => setInfo(getTaskInfoFromAgent(agent));

    const unsubscribe = agentManager.on("tool:start", (event) => {
      if (event.agentId !== id) return;
      refresh();
    });

    return unsubscribe;
  }, [agent, id]);

  return { ...info, agent };
};
