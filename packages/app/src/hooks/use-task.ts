import { useEffect, useState } from "react";

import { resolveAgentSession } from "../utils/session-resolve.js";
import { isToolCallPart, parseToolInput } from "../utils/tool-part.js";

import { useSubAgents } from "./use-sub-agents.js";

import type { AgentSession, TokenUsage } from "@my-agent/core";
import type { ToolCallState, UIMessage } from "@tanstack/ai";

const BEGIN_SUMMARY_TOOL_NAME = "begin_summary";

type TaskToolCall = {
  toolCallId: string;
  toolName: string;
  input: unknown;
  state: ToolCallState;
};

export type TaskRunPhase = "tools" | "summary";

const getTaskPhaseFromMessages = (messages: UIMessage[]): TaskRunPhase => {
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

const readTaskInfo = (session: AgentSession | null) => {
  const messages = session?.getSnapshot().messages ?? [];
  const allTools = getTaskToolsFromMessages(messages);
  const usage: TokenUsage | null = session ? { ...session.getSnapshot().usage.total } : null;
  return {
    allTools,
    total: allTools.length,
    usage,
    phase: getTaskPhaseFromMessages(messages),
  };
};

export const useTask = ({ taskId }: { taskId: string }) => {
  const subagent = useSubAgents({ taskId });
  const [info, setInfo] = useState(() => readTaskInfo(null));

  useEffect(() => {
    if (!subagent?.id) return;

    const childSession = resolveAgentSession(subagent.id);
    if (!childSession) return;

    const refresh = () => {
      setInfo(readTaskInfo(childSession));
    };

    refresh();
    return childSession.subscribe(
      () => {
        refresh();
      },
      { channels: ["messages", "usage", "state", "lifecycle"] }
    );
  }, [subagent, subagent?.id]);

  return { ...info, agent: subagent, phase: taskId ? info.phase : ("tools" as const) };
};
