import { useAgent } from "../hooks/useAgent";
import { useAgentContext } from "../hooks/useAgentContext";
import { useAgentLog } from "../hooks/useAgentLog";
import { useStatic } from "../hooks/useStatic";

import type { Agent, AgentContext, AgentLog } from "@my-agent/core";

export const Debug = () => {
  useAgent((s) => s.agent as Agent) as Agent;
  useAgentLog((s) => s.log as AgentLog);
  useAgentContext((s) => s.context as AgentContext);

  useStatic();

  return null;
};
