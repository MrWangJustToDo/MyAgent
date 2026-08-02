import { agentManager, createLocalAgentSession, sessionForSubagent } from "@my-agent/core";
import { useEffect, useState } from "react";

import { isToolCallPart, parseToolInput } from "../utils/tool-part.js";

import { useSubAgents } from "./use-sub-agents";

import type { AgentSession, ManagedAgent, TokenUsage } from "@my-agent/core";
import type { ToolCallState, UIMessage } from "@tanstack/ai";

const BEGIN_SUMMARY_TOOL_NAME = "begin_summary";

type TaskToolCall = {
  toolCallId: string;
  toolName: string;
  input: unknown;
  state: ToolCallState;
};

export type TaskRunPhase = "tools" | "summary";

const getTaskPhaseFromMessages = (messages: UIMessage[], managed?: ManagedAgent): TaskRunPhase => {
  const phase = managed?.ui?.getTaskRunPhase?.();
  if (phase === "summary") return "summary";
  // Fallback: if begin_summary appears in messages, treat as summary phase.
  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    for (const part of msg.parts) {
      if (isToolCallPart(part) && part.name === BEGIN_SUMMARY_TOOL_NAME) {
        return "summary";
      }
    }
  }
  return "tools";
};

const getTaskToolsFromMessages = (messages: UIMessage[]): TaskToolCall[] => {
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

const readTaskInfo = (session: AgentSession | null, managed?: ManagedAgent) => {
  const messages = session?.getSnapshot().messages ?? managed?.ui?.getMessages() ?? [];
  const allTools = getTaskToolsFromMessages(messages);
  const usage: TokenUsage | null = session ? { ...session.getSnapshot().usage.total } : null;
  return {
    allTools,
    total: allTools.length,
    usage,
    phase: getTaskPhaseFromMessages(messages, managed),
  };
};

export const useTask = ({ taskId }: { taskId: string }) => {
  const agent = useSubAgents({ taskId });

  const [info, setInfo] = useState(() => readTaskInfo(null, agent));

  useEffect(() => {
    if (!agent?.id) return;

    const childSession =
      sessionForSubagent(agentManager, agent.id) ?? createLocalAgentSession({ managed: agent, manager: agentManager });

    const refresh = () => {
      setInfo(readTaskInfo(childSession, agent));
    };

    refresh();
    return childSession.subscribe(
      () => {
        refresh();
      },
      { channels: ["messages", "usage", "state", "lifecycle"] }
    );
  }, [agent, agent?.id]);

  return { ...info, agent, phase: taskId ? info.phase : ("tools" as const) };
};
