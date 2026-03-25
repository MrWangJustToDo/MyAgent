/* eslint-disable @typescript-eslint/ban-ts-comment */
import { useAgent } from "../hooks/use-agent";
import { useAgentContext } from "../hooks/use-agent-context";
import { useAgentLog } from "../hooks/use-agent-log";
import { useAgentManager } from "../hooks/use-agent-manager";
import { useStatic } from "../hooks/use-static";

import type { Agent, AgentContext, AgentLog } from "@my-agent/core";

export const Debug = () => {
  // @ts-ignore
  useAgent((s) => s.agent as Agent) as Agent;

  // @ts-ignore
  useAgentLog((s) => s.log as AgentLog);

  // @ts-ignore
  useAgentContext((s) => s.context as AgentContext);

  // @ts-ignore
  useAgentManager((s) => s.state);

  // @ts-ignore
  useStatic();

  return null;
};
