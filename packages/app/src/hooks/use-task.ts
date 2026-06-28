import { useEffect, useState } from "react";

import { useSubAgents } from "./use-sub-agents";

import type { Agent, AgentContext } from "@my-agent/core";

type TaskInfo = {
  allTools?: ReturnType<AgentContext["getTools"]>;
  total?: number;
  finish?: AgentContext["finishInfo"];
};

const getTaskInfoFromAgent = (agent?: Agent) => {
  const allTools = agent?.context?.getTools();
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
    const cb = agent?.context?.onTool(() => {
      setInfo(getTaskInfoFromAgent(agent));
    });

    return () => {
      cb?.();
    };
  }, [agent]);

  return { ...info, agent };
};
