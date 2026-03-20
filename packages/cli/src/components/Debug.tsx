import { useAgent } from "../hooks/use-agent";
import { useAgentContext } from "../hooks/use-agent-context";
import { useAgentLog } from "../hooks/use-agent-log";
import { useStatic } from "../hooks/use-static";

import type { Agent, AgentContext, AgentLog } from "@my-agent/core";

export const Debug = () => {
  useAgent((s) => s.agent as Agent) as Agent;

  useAgentLog((s) => s.log as AgentLog);

  useAgentContext((s) => s.context as AgentContext);

  useStatic();

  return null;
};
