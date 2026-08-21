import { Box, Text } from "ink";
import { useMemo } from "react";

import { Spinner } from "../components/Spinner.js";
import { TranscriptDisplayContext } from "../context/transcript-display-context.js";
import { useSize } from "../hooks";
import { useSubagentMessages } from "../hooks/use-subagent-messages.js";
import { useTranscriptDisplay } from "../hooks/use-transcript-display.js";
import { COLORS } from "../theme/colors.js";
import { getMessages } from "../utils/get-messages.js";
import { truncateTextToMaxLines } from "../utils/user-message-lines.js";

import { MessageView } from "./MessageView.js";

import type { TranscriptDisplayMode } from "../hooks/use-transcript-display.js";
import type { TextPart, UIMessage } from "@tanstack/ai";

export interface SubagentPreviewViewProps {
  subagentId: string;
}

/** Keep the task prompt short so tool activity stays on-screen in the panel. */
const PANEL_PROMPT_MAX_CHARS = 280;

/** Max flattened rows after the prompt (tools / text) to keep the overlay usable. */
const PANEL_ACTIVITY_TAIL = 48;

/** Max physical rows for the first user message (the task prompt), which can be huge when a task analysis fails. */
const PANEL_PROMPT_MAX_LINES = 60;

function truncatePromptText(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const slice = trimmed.slice(0, maxChars);
  const lastBreak = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf(". "), slice.lastIndexOf(" "));
  const cut = lastBreak > maxChars * 0.45 ? slice.slice(0, lastBreak) : slice;
  return `${cut.trimEnd()}…`;
}

function collapseUserPrompts(messages: UIMessage[]): UIMessage[] {
  return messages.map((message, index) => {
    if (message.role !== "user") return message;
    if (index === 0) return message;
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

function selectPanelPreviewMessages(
  messages: UIMessage[],
  mode: TranscriptDisplayMode,
  textWidth: number
): {
  prompt: UIMessage | null;
  activity: UIMessage[];
  omittedEarlier: boolean;
} {
  const collapsed = collapseUserPrompts(messages);
  const { staticMessages, dynamicMessages } = getMessages(collapsed, { mode });
  const all = [...staticMessages, ...dynamicMessages];

  const firstUserIndex = all.findIndex((m) => m.role === "user");
  let prompt = firstUserIndex >= 0 ? all[firstUserIndex]! : null;
  if (prompt) {
    // Cap the first user message (the task prompt) to a bounded height so a
    // huge prompt (e.g. a failed task analysis echoing the full context) cannot
    // overflow the panel. Rendering goes through UserMessageView whose text
    // column is screenWidth - 6, so truncate at that exact width.
    prompt = {
      ...prompt,
      parts: prompt.parts.map((part) => {
        if (part.type !== "text") return part;
        const content = (part as TextPart).content ?? "";
        const { text } = truncateTextToMaxLines(content, textWidth, PANEL_PROMPT_MAX_LINES);
        return { ...part, content: text };
      }),
    };
  }
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

  const mode = useTranscriptDisplay((s) => s.mode);

  const screenWidth = useSize((s) => s.state.screenWidth);
  // Align with UserMessageView: contentWidth = screenWidth - 2, text column
  // subtracts the 4-wide "> " prefix, so text width is screenWidth - 6.
  const promptTextWidth = Math.max(1, screenWidth - 6);

  const { prompt, activity, omittedEarlier } = useMemo(
    () => selectPanelPreviewMessages(messages, mode, promptTextWidth),
    [messages, mode, promptTextWidth]
  );

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
