import { useMemo } from "react";

import { useAgentStatus } from "../hooks/use-agent-status";
import { useCompactSummaryText } from "../hooks/use-compact-summary-text";
import { formatCompactionSummaryContent } from "../utils/compaction-summary.js";

import { MessageList } from "./MessageList";

import type { UIMessage } from "@tanstack/ai";

export const MessageViewWithCompact = ({ messages }: { messages: UIMessage[] }) => {
  const status = useAgentStatus((s) => s.status);

  const isCompacting = status === "compacting";

  const { text: compactSummaryText, label: compactLabel } = useCompactSummaryText({ enabled: isCompacting });

  const displayMessages = useMemo(() => {
    if (!isCompacting || !compactSummaryText) return messages;
    // Inject a synthetic user message to render the streaming compact summary.
    // The phase label distinguishes sequential summarizer passes (history /
    // discarded-turn / segment merges) that reuse the same stream key.
    const header = compactLabel ? `[${compactLabel}]\n\n` : "";
    const synthetic: UIMessage = {
      id: "compact-streaming",
      role: "user",
      parts: [{ type: "text", content: `${header}${formatCompactionSummaryContent(compactSummaryText)}` }],
    };
    return [...messages, synthetic];
  }, [messages, isCompacting, compactSummaryText, compactLabel]);

  return <MessageList messages={displayMessages} />;
};
