import { agentManager } from "@my-agent/core";
import { useEffect, useState } from "react";

import { isToolCallPart, parseToolInput } from "../utils/tool-part.js";

import { useSubAgents } from "./use-sub-agents";

import type { ManagedAgent } from "@my-agent/core";
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

const getTaskInfoFromAgent = (agent?: ManagedAgent) => {
  const allTools = getTaskToolsFromAgent(agent);
  return {
    allTools,
    total: allTools.length,
  };
};

export const useTask = ({ id, taskId }: { id: string; taskId: string }) => {
  const agent = useSubAgents({ subId: id, taskId });

  const [info, setInfo] = useState(() => getTaskInfoFromAgent(agent));
  const [phase, setPhase] = useState<TaskRunPhase>(() => getTaskPhaseFromAgent(agent));

  useEffect(() => {
    if (!id) return;

    const refresh = () => {
      setInfo(getTaskInfoFromAgent(agent));
      setPhase(getTaskPhaseFromAgent(agent));
    };

    const unsubscribe = agent?.ui?.subscribe(() => refresh());
    const unsubs = [
      agentManager.on("subagent:created", (event) => {
        if (event.agentId !== id) return;
        refresh();
      }),
      agentManager.on("subagent:started", (event) => {
        if (event.data?.subagent_id !== id && event.agentId !== id) return;
        refresh();
      }),
      agentManager.on("subagent:ui-update", (event) => {
        if (event.agentId !== id) return;
        refresh();
      }),
    ];

    refresh();

    return () => {
      unsubscribe?.();
      unsubs.forEach((unsub) => unsub());
    };
  }, [agent, id]);

  return { ...info, agent, phase: id ? phase : ("tools" as const) };
};
