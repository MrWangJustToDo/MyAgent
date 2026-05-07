import { AlertTriangleIcon } from "lucide-react";

import { useAgentChat } from "@/hooks/useAgentChat";
import { useUsage } from "@/hooks/useUsage";

import { ChatHeader } from "./ChatHeader";
import { ChatInput } from "./ChatInput";
import { MessageList } from "./MessageList";
import { UsageBar } from "./UsageBar";

export const ChatPanel = () => {
  const { messages, sendMessage, isLoading, stop, allPendingApproval, addToolApprovalResponse, status, error } =
    useAgentChat();
  const usage = useUsage(isLoading);

  return (
    <div className="flex h-full flex-col">
      <ChatHeader status={status} />
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
