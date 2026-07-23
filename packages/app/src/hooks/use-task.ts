import { useEffect, useState } from "react";

import { isToolCallPart, parseToolInput } from "../utils/tool-part.js";

import { useSubAgents } from "./use-sub-agents";

import type { ManagedAgent, TokenUsage } from "@my-agent/core";
import type { ToolCallState } from "@tanstack/ai";

const BEGIN_SUMMARY_TOOL_NAME = "begin_summary";

type TaskToolCall = {
  toolCallId: string;
  toolName: string;
  input: unknown;
  state: ToolCallState;
};

export type TaskRunPhase = "tools" | "summary";

const getTaskPhaseFromAgent = (agent?: ManagedAgent): TaskRunPhase => {
  const phase = agent?.ui?.getTaskRunPhase?.();
  return phase === "summary" ? "summary" : "tools";
};

const getTaskToolsFromAgent = (agent?: ManagedAgent): TaskToolCall[] => {
  const messages = agent?.ui?.getMessages();
  if (!messages) return [];

  const tools: TaskToolCall[] = [];
  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    for (const part of msg.parts) {
      if (!isToolCallPart(part)) continue;
      if (part.name === BEGIN_SUMMARY_TOOL_NAME) continue;
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

const getTaskUsageFromAgent = (agent?: ManagedAgent): TokenUsage | null => {
  if (!agent?.usage) return null;
  return { ...agent.usage.getTotal() };
};

const getTaskInfoFromAgent = (agent?: ManagedAgent) => {
  const allTools = getTaskToolsFromAgent(agent);
  return {
    allTools,
    total: allTools.length,
    usage: getTaskUsageFromAgent(agent),
  };
};

export const useTask = ({ taskId }: { taskId: string }) => {
  const agent = useSubAgents({ taskId });

  const [info, setInfo] = useState(() => getTaskInfoFromAgent(agent));
  const [phase, setPhase] = useState<TaskRunPhase>(() => getTaskPhaseFromAgent(agent));

  useEffect(() => {
    if (!agent?.id) return;

    const refresh = () => {
      setInfo(getTaskInfoFromAgent(agent));
      setPhase(getTaskPhaseFromAgent(agent));
    };

    refresh();
    return agent.observe({
      onMessages: () => refresh(),
      events: ["subagent:created", "subagent:started", "subagent:completed", "agent:stop"],
      onEvent: refresh,
    });
  }, [agent, agent?.id]);

  return { ...info, agent, phase: taskId ? phase : ("tools" as const) };
};
