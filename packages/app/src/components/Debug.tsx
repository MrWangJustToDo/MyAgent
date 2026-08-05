/* eslint-disable @typescript-eslint/ban-ts-comment */
import { useUserInput } from "../hooks";
import { useAgent } from "../hooks/use-agent";
import { useAgentLog } from "../hooks/use-agent-log";
import { useAgentManager } from "../hooks/use-agent-manager";
import { useStatic } from "../hooks/use-static";

import type { ManagedAgent, AgentLog } from "@my-agent/core";

export const Debug = () => {
  // @ts-ignore
  useAgent((s) => s.agent as ManagedAgent) as ManagedAgent;

  // @ts-ignore
  useAgentLog((s) => s.log as AgentLog);

  // @ts-ignore
  useAgentManager((s) => s.state);

  // @ts-ignore
  useStatic();

  useUserInput((s) => s);

  return null;
};
