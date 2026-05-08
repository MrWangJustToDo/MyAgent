import { AlertTriangleIcon } from "lucide-react";
import { useState } from "react";

import { useAgentChat } from "@/hooks/useAgentChat";
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
  const {
    messages,
    sendMessage,
    isLoading,
    stop,
    allPendingApproval,
    addToolApprovalResponse,
    status,
    error,
    setMessages,
  } = useAgentChat();
  const usage = useUsage(isLoading);
  const { sessions, resumeSession } = useSessions();

  const handleResumeSession = async (session: SessionMeta) => {
    const result = await resumeSession(session.id);
    if (result) {
      setMessages(result.uiMessages as UIMessage[]);
    }
    setShowSessions(false);
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
      <MessageList
        messages={messages}
        isLoading={isLoading}
        allPendingApproval={allPendingApproval}
        addToolApprovalResponse={addToolApprovalResponse}
      />
      <UsageBar usage={usage} />
      <ChatInput onSend={sendMessage} isLoading={isLoading} onStop={stop} />
    </div>
  );
};
