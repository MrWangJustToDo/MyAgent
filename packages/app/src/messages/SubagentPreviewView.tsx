import { Box, Text } from "ink";
import { useMemo } from "react";

import { Spinner } from "../components/Spinner.js";
import { TranscriptDisplayContext } from "../context/transcript-display-context.js";
import { useSubagentMessages } from "../hooks/use-subagent-messages.js";
import { COLORS } from "../theme/colors.js";
import { getMessages } from "../utils/get-messages.js";

import { MessageView } from "./MessageView.js";

import type { TextPart, UIMessage } from "@tanstack/ai";

export interface SubagentPreviewViewProps {
  subagentId: string;
}

/** Keep the task prompt short so tool activity stays on-screen in the panel. */
const PANEL_PROMPT_MAX_CHARS = 280;

/** Max flattened rows after the prompt (tools / text) to keep the overlay usable. */
const PANEL_ACTIVITY_TAIL = 48;

function truncatePromptText(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const slice = trimmed.slice(0, maxChars);
  const lastBreak = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf(". "), slice.lastIndexOf(" "));
  const cut = lastBreak > maxChars * 0.45 ? slice.slice(0, lastBreak) : slice;
  return `${cut.trimEnd()}…`;
}

function collapseUserPrompts(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => {
    if (message.role !== "user") return message;
    return {
      ...message,
      parts: message.parts.map((part) => {
        if (part.type !== "text") return part;
        const content = (part as TextPart).content ?? "";
        return { ...part, content: truncatePromptText(content, PANEL_PROMPT_MAX_CHARS) };
      }),
    };
  });
}

function selectPanelPreviewMessages(messages: UIMessage[]): {
  prompt: UIMessage | null;
  activity: UIMessage[];
  omittedEarlier: boolean;
} {
  const collapsed = collapseUserPrompts(messages);
  const { staticMessages, dynamicMessages } = getMessages(collapsed, { mode: "compact" });
  const all = [...staticMessages, ...dynamicMessages];

  const firstUserIndex = all.findIndex((m) => m.role === "user");
  const prompt = firstUserIndex >= 0 ? all[firstUserIndex]! : null;
  const rest = all.filter((_, i) => i !== firstUserIndex);
  const omittedEarlier = rest.length > PANEL_ACTIVITY_TAIL;

  return {
    prompt,
    activity: rest.slice(-PANEL_ACTIVITY_TAIL),
    omittedEarlier,
  };
}

/**
 * Read-only subagent transcript for the task panel.
 * Collapses the long task prompt and uses compact tool rows so live work stays visible.
 */
export const SubagentPreviewView = ({ subagentId }: SubagentPreviewViewProps) => {
  const messages = useSubagentMessages(subagentId);
  const { prompt, activity, omittedEarlier } = useMemo(() => selectPanelPreviewMessages(messages), [messages]);

  if (!prompt && activity.length === 0) {
    return (
      <Box paddingLeft={1}>
        <Spinner />
      </Box>
    );
  }

  return (
    <TranscriptDisplayContext value="compact">
      <Box flexDirection="column">
        {prompt ? <MessageView key={prompt.id} message={prompt} readOnly /> : null}
        {omittedEarlier ? (
          <Box paddingLeft={1} marginY={1}>
            <Text color={COLORS.muted} dimColor>
              …earlier tool activity omitted
            </Text>
          </Box>
        ) : null}
        {activity.map((message) => (
          <MessageView key={message.id} message={message} readOnly />
        ))}
      </Box>
    </TranscriptDisplayContext>
  );
};
