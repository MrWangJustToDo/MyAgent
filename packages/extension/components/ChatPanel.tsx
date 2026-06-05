import { AlertTriangleIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { useAgentChat } from "@/hooks/useAgentChat";
import { useServerConfig } from "@/hooks/useServerConfig";
import { useSessions } from "@/hooks/useSessions";
import { useUsage } from "@/hooks/useUsage";

import { ChatHeader } from "./ChatHeader";
import { ChatInput } from "./ChatInput";
import { MessageList } from "./MessageList";
import { SessionPicker } from "./SessionPicker";
import { UsageBar } from "./UsageBar";

import type { SessionMeta } from "@/hooks/useSessions";
import type { UIMessage } from "ai";

export const ChatPanel = () => {
  const [showSessions, setShowSessions] = useState(false);
  const [compactMessage, setCompactMessage] = useState<string | null>(null);
  const askUserStartRef = useRef<Record<string, number>>({});

  const {
    messages,
    sendMessage,
    isLoading,
    stop,
    allPendingApproval,
    allPendingAskUser,
    addToolApprovalResponse,
    addToolOutput,
    status,
    error,
    setMessages,
  } = useAgentChat();
  const usage = useUsage(isLoading);
  const serverUrl = useServerConfig((s) => s.url);
  const { sessions, resumeSession } = useSessions();

  const handleResumeSession = async (session: SessionMeta) => {
    const result = await resumeSession(session.id);
    if (result) {
      setMessages(result.uiMessages as UIMessage[]);
    }
    setShowSessions(false);
  };

  const submitAskUserAnswer = useCallback(
    (toolCallId: string, answer: string) => {
      const pending = allPendingAskUser.find((p) => p.toolCallId === toolCallId);
      if (!pending) return;

      const start = askUserStartRef.current[toolCallId] ?? Date.now();
      const durationMs = Date.now() - start;
      delete askUserStartRef.current[toolCallId];

      addToolOutput({
        tool: "ask_user",
        toolCallId,
        output: {
          question: pending.question,
          answer,
          hasOptions: !!pending.options?.length,
          message: `User responded: ${answer}`,
          durationMs,
        },
      });
    },
    [addToolOutput, allPendingAskUser]
  );

  if (allPendingAskUser.length > 0) {
    for (const p of allPendingAskUser) {
      if (!askUserStartRef.current[p.toolCallId]) {
        askUserStartRef.current[p.toolCallId] = Date.now();
      }
    }
  }

  const handleCompact = async (focus?: string) => {
    setCompactMessage(null);
    try {
      const res = await fetch(`${serverUrl}/api/compact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ focus }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || data.error) {
        setCompactMessage(data.error ?? "Compaction failed");
      } else {
        setCompactMessage(data.message ?? "Context compacted");
      }
    } catch (err) {
      setCompactMessage(err instanceof Error ? err.message : "Compaction failed");
    }
  };

  if (showSessions) {
    return (
      <SessionPicker sessions={sessions} onSelect={handleResumeSession} onNewSession={() => setShowSessions(false)} />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ChatHeader status={status} onShowSessions={() => setShowSessions(true)} />
      {error && (
        <div className="bg-danger-50 text-danger-700 flex items-center gap-2 px-3 py-1.5 text-xs">
          <AlertTriangleIcon className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="truncate">{error.message}</span>
        </div>
      )}
      {compactMessage && (
        <div className="bg-primary-50 text-primary-700 px-3 py-1.5 text-xs">
          <span>{compactMessage}</span>
        </div>
      )}
      <MessageList
        messages={messages}
        isLoading={isLoading}
        allPendingApproval={allPendingApproval}
        allPendingAskUser={allPendingAskUser}
        addToolApprovalResponse={addToolApprovalResponse}
        submitAskUserAnswer={submitAskUserAnswer}
      />
      <UsageBar usage={usage} />
      <ChatInput onSend={sendMessage} isLoading={isLoading} onStop={stop} onCompact={handleCompact} />
    </div>
  );
};
