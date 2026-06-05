import { isFileUIPart, isTextUIPart, isToolUIPart, getToolName } from "ai";
import { UserIcon, BotIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { AskUserView } from "./AskUserView";
import { MarkdownView } from "./MarkdownView";
import { ReasoningView } from "./ReasoningView";
import { StreamingIndicator } from "./StreamingIndicator";
import { TodoList } from "./TodoList";
import { ToolApprovalView } from "./ToolApprovalView";
import { ToolCallView } from "./ToolCallView";

import type { FileUIPart, ToolUIPart, UIMessage } from "ai";

interface MessageListProps {
  messages: UIMessage[];
  isLoading: boolean;
  allPendingApproval: Array<{ id: string; toolName: string; toolCallId: string }>;
  allPendingAskUser: Array<{
    toolCallId: string;
    question: string;
    options?: string[];
    multiSelect?: boolean;
  }>;
  addToolApprovalResponse: (options: { id: string; approved: boolean; reason?: string }) => void;
  submitAskUserAnswer: (toolCallId: string, answer: string) => void;
}

export const MessageList = ({
  messages,
  isLoading,
  allPendingApproval,
  allPendingAskUser,
  addToolApprovalResponse,
  submitAskUserAnswer,
}: MessageListProps) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [messages, isLoading]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="text-default-400 text-center">
          <BotIcon className="mx-auto mb-2 h-10 w-10" />
          <p className="text-sm">Start a conversation with your agent.</p>
          <p className="text-default-400 mt-1 text-xs">Try /compact to compress context.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 py-2">
      {messages.map((message) => (
        <MessageView
          key={message.id}
          message={message}
          allPendingApproval={allPendingApproval}
          allPendingAskUser={allPendingAskUser}
          addToolApprovalResponse={addToolApprovalResponse}
          submitAskUserAnswer={submitAskUserAnswer}
        />
      ))}
      {isLoading && <StreamingIndicator />}
      <div ref={bottomRef} />
    </div>
  );
};

const MessageView = ({
  message,
  allPendingApproval,
  allPendingAskUser,
  addToolApprovalResponse,
  submitAskUserAnswer,
}: {
  message: UIMessage;
  allPendingApproval: Array<{ id: string; toolName: string; toolCallId: string }>;
  allPendingAskUser: Array<{
    toolCallId: string;
    question: string;
    options?: string[];
    multiSelect?: boolean;
  }>;
  addToolApprovalResponse: (options: { id: string; approved: boolean; reason?: string }) => void;
  submitAskUserAnswer: (toolCallId: string, answer: string) => void;
}) => {
  const isUser = message.role === "user";

  return (
    <div className={`mb-3 flex gap-2 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${isUser ? "bg-primary/10" : "bg-default-100"}`}
      >
        {isUser ? (
          <UserIcon className="text-primary h-3.5 w-3.5" />
        ) : (
          <BotIcon className="text-default-600 h-3.5 w-3.5" />
        )}
      </div>
      <div className={`min-w-0 ${isUser ? "max-w-[85%] text-right" : "flex-1"}`}>
        {message.parts.map((part, i) => {
          if (isTextUIPart(part)) {
            if (!part.text) return null;
            const isStreaming = part.state === "streaming";
            return isUser ? (
              <div key={i} className="bg-primary/10 inline-block rounded-lg px-3 py-2 text-sm">
                {part.text}
              </div>
            ) : (
              <MarkdownView key={i} content={part.text} isStreaming={isStreaming} />
            );
          }
          if (isFileUIPart(part)) {
            const filePart = part as FileUIPart;
            if (filePart.mediaType?.startsWith("image/")) {
              return (
                <div key={i} className="mb-1">
                  <img
                    src={filePart.url}
                    alt={filePart.filename || "image"}
                    className="max-h-48 max-w-full rounded border object-contain"
                  />
                </div>
              );
            }
            return (
              <div key={i} className="bg-default-100 mb-1 inline-block rounded px-2 py-1 text-xs">
                {filePart.filename || "file"}
              </div>
            );
          }
          if (isToolUIPart(part)) {
            const pendingApproval = allPendingApproval.find((p) => p.toolCallId === part.toolCallId);
            if (pendingApproval) {
              return (
                <ToolApprovalView
                  key={i}
                  part={part as ToolUIPart}
                  onApprove={() => addToolApprovalResponse({ id: pendingApproval.id, approved: true })}
                  onDeny={(reason) => addToolApprovalResponse({ id: pendingApproval.id, approved: false, reason })}
                />
              );
            }

            const pendingAsk = allPendingAskUser.find((p) => p.toolCallId === part.toolCallId);
            if (pendingAsk && getToolName(part) === "ask_user") {
              return (
                <AskUserView
                  key={i}
                  question={pendingAsk.question}
                  options={pendingAsk.options}
                  multiSelect={pendingAsk.multiSelect}
                  onSubmit={(answer) => submitAskUserAnswer(pendingAsk.toolCallId, answer)}
                />
              );
            }

            return <ToolCallView key={i} part={part as ToolUIPart} />;
          }
          if (part.type === "reasoning") {
            return <ReasoningView key={i} text={part.text} isStreaming={part.state === "streaming"} />;
          }
          return null;
        })}
        <TodoList message={message} />
      </div>
    </div>
  );
};
