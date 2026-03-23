import { agentManager } from "@my-agent/core";
import { useEffect, useMemo } from "react";
import { createState, toRaw } from "reactivity-store";

import { useAgent } from "./use-agent";

import type { AgentContext } from "@my-agent/core";

const getManagerSubagent = (subId: string) => {
  const id = useAgent.getReadonlyState().agent?.id;

  if (!id) return;

  const allSub = agentManager.getSubagents(id);

  const managerAgent = allSub.find((i) => i.id === subId);

  return managerAgent;
};

export const useSubAgents = ({ subId }: { subId: string }) => {
  const useSubagentContext = useMemo(
    () =>
      createState(() => ({ state: toRaw(getManagerSubagent(subId)?.context) as null | AgentContext }), {
        withActions: (s) => ({
          setContext: (context: AgentContext) => (s.state = context),
        }),
        withNamespace: "useSubagentContext",
      }),
    []
  );

  useEffect(() => {
    const managerAgent = getManagerSubagent(subId);

    const exist = useSubagentContext.getReadonlyState().state;

    if (managerAgent && toRaw(exist) !== toRaw(managerAgent.context)) {
      useSubagentContext.getActions().setContext(toRaw(managerAgent.context));

      return;
    }

    const cb = agentManager.on("subagent:created", ({ subagentId }) => {
      const managerAgent = agentManager.getAgent(subagentId);
      const exist = useSubagentContext.getReadonlyState().state;
      if (managerAgent?.id === subId && toRaw(exist) !== toRaw(managerAgent.context)) {
        useSubagentContext.getActions().setContext(toRaw(managerAgent.context));
      }
    });

    return cb;
  }, [subId]);

  return useSubagentContext;
};
