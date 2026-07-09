import { agentManager } from "@my-agent/core";
import { useEffect, useState } from "react";

import { isToolCallPart, parseToolInput } from "../utils/tool-part.js";

import { useSubAgents } from "./use-sub-agents";

import type { ManagedAgent } from "@my-agent/core";
import type { ToolCallState } from "@tanstack/ai";

type TaskToolCall = {
  toolCallId: string;
  toolName: string;
  input: unknown;
  state: ToolCallState;
};

const getTaskToolsFromAgent = (agent?: ManagedAgent): TaskToolCall[] => {
  const messages = agent?.ui?.getMessages();
  if (!messages) return [];

  const tools: TaskToolCall[] = [];
  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    for (const part of msg.parts) {
      if (!isToolCallPart(part)) continue;
      tools.push({
        toolCallId: part.id,
        toolName: part.name,
        input: parseToolInput(part),
        state: part.state,
      });
    }
  }
  return tools;
};

const getTaskInfoFromAgent = (agent?: ManagedAgent) => {
  const allTools = getTaskToolsFromAgent(agent);
  return {
    allTools,
    total: allTools.length,
  };
};

export const useTask = ({ id }: { id: string }) => {
  const agent = useSubAgents({ subId: id });

  const [info, setInfo] = useState(() => getTaskInfoFromAgent(agent));

  useEffect(() => {
    if (!agent) return;

    const refresh = () => setInfo(getTaskInfoFromAgent(agent));

    const unsubscribe = agent.ui?.subscribe(() => refresh());
    const unsubCreated = agentManager.on("subagent:created", (event) => {
      if (event.agentId !== id) return;
      refresh();
    });
    const unsubStarted = agentManager.on("subagent:started", (event) => {
      if (event.data?.subagent_id !== id && event.agentId !== id) return;
      refresh();
    });

    refresh();

    return () => {
      unsubscribe?.();
      unsubCreated();
      unsubStarted();
    };
  }, [agent, id]);

  return { ...info, agent };
};
