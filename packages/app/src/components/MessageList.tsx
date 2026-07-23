/**
 * MessageList - Renders a list of UIMessages with their parts.
 *
 * Uses AI SDK's UIMessage format with parts (text, reasoning, tool-*, etc).
 * Static messages are capped to limit terminal output and improve performance.
 */

import { Box, Text } from "ink";
import { useEffect, useRef } from "react";

import { TranscriptDisplayContext } from "../context/transcript-display-context.js";
import { useDynamic } from "../hooks/use-dynamic";
import { useStatic } from "../hooks/use-static";
import { useTranscriptDisplay } from "../hooks/use-transcript-display.js";
import { MessageView, StaticContext } from "../messages";
import { COLORS } from "../theme/colors.js";
import { getMessages } from "../utils/get-messages";

import { CursorFlush } from "./CursorFlush";

import type { UIMessage } from "@tanstack/ai";
import type { JSX } from "react";

// ============================================================================
// Constants
// ============================================================================

/** Maximum number of completed (static) flat parts to render. Older messages are truncated with a summary line. */
const MAX_STATIC_PARTS = 40;

// ============================================================================
// Props
// ============================================================================

export interface MessageListProps {
  messages: UIMessage[];
}

function computeDynamicListSignature(messages: UIMessage[]): string {
  return messages
    .map((m) => {
      const part = m.parts[0];
      if (!part) return m.id;
      if (part.type === "tool-call") {
        const tool = part as { id?: string; state?: string; output?: unknown; approval?: { approved?: boolean } };
        const hasOutput = tool.output !== undefined ? "1" : "0";
        const approval =
          tool.approval?.approved === true ? "a" : tool.approval?.approved === false ? "d" : tool.approval ? "p" : "-";
        return `${m.id}:${tool.id ?? ""}:${tool.state ?? ""}:${hasOutput}:${approval}`;
      }
      if (part.type === "text") {
        const content = (part as { content?: string }).content ?? "";
        return `${m.id}:text:${content.length}:${content.slice(0, 24)}`;
      }
      return `${m.id}:${part.type}`;
    })
    .join("|");
}

// ============================================================================
// Main Component
// ============================================================================

export const MessageList = ({ messages }: MessageListProps) => {
  const mode = useTranscriptDisplay((s) => s.mode);
  const { staticMessages, dynamicMessages, toolCallsSignature } = getMessages(messages, {
    mode,
  });

  // ── Truncate static list to bounded size ──
  const hiddenPartCount = staticMessages.length > MAX_STATIC_PARTS ? staticMessages.length - MAX_STATIC_PARTS : 0;
  const visibleStaticMessages = hiddenPartCount > 0 ? staticMessages.slice(-MAX_STATIC_PARTS) : staticMessages;
  const visibleStaticLength = visibleStaticMessages.length;
  const dynamicSignature = computeDynamicListSignature(dynamicMessages);

  // Rebuild static list when length changes, projection/mode changes, or static tool state updates.
  const lastStaticLengthRef = useRef(0);
  const lastToolCallsSignatureRef = useRef("");
  const lastHiddenCountRef = useRef(0);
  const lastModeRef = useRef(mode);
  const lastDynamicSignatureRef = useRef("");
  const lastHasStaticRef = useRef(false);
  const lastDynamicModeRef = useRef(mode);
  const staticListRef = useRef<JSX.Element[]>([]);
  const dynamicListRef = useRef<JSX.Element | JSX.Element[]>(
    <Box paddingX={1} marginTop={1}>
      <Text color={COLORS.muted} dimColor>
        No messages yet. Type a message to start.
      </Text>
    </Box>
  );
  const hasStatic = staticMessages.length > 0;

  if (
    visibleStaticLength !== lastStaticLengthRef.current ||
    toolCallsSignature !== lastToolCallsSignatureRef.current ||
    hiddenPartCount !== lastHiddenCountRef.current ||
    mode !== lastModeRef.current
  ) {
    lastStaticLengthRef.current = visibleStaticLength;
    lastToolCallsSignatureRef.current = toolCallsSignature;
    lastHiddenCountRef.current = hiddenPartCount;
    lastModeRef.current = mode;

    const elements = visibleStaticMessages.map((item) => (
      <Box key={item.id} paddingX={1} marginTop={1}>
        <TranscriptDisplayContext value={mode}>
          <StaticContext value={{ staticMessage: true }}>
            <MessageView message={item} />
          </StaticContext>
        </TranscriptDisplayContext>
      </Box>
    ));

    if (hiddenPartCount > 0) {
      elements.unshift(
        <Box key="truncation-marker" paddingX={1} marginTop={1}>
          <Text color={COLORS.muted} dimColor>
            ... {hiddenPartCount} older message{hiddenPartCount === 1 ? "" : "s"} hidden
          </Text>
        </Box>
      );
    }

    staticListRef.current = elements;
  }

  if (
    dynamicSignature !== lastDynamicSignatureRef.current ||
    hasStatic !== lastHasStaticRef.current ||
    mode !== lastDynamicModeRef.current
  ) {
    // Rebuild dynamic list only when live content or display mode changes.
    lastDynamicSignatureRef.current = dynamicSignature;
    lastHasStaticRef.current = hasStatic;
    lastDynamicModeRef.current = mode;

    dynamicListRef.current = dynamicMessages.length ? (
      dynamicMessages.map((message) => (
        <Box key={message.id} paddingX={1} marginTop={1}>
          <TranscriptDisplayContext value={mode}>
            <StaticContext value={{ staticMessage: false }}>
              <MessageView message={message} />
            </StaticContext>
          </TranscriptDisplayContext>
        </Box>
      ))
    ) : (
      <Box paddingX={1} marginTop={1}>
        <Text color={COLORS.muted} dimColor>
          {hasStatic ? <CursorFlush /> : "No messages yet. Type a message to start."}
        </Text>
      </Box>
    );
  }

  useEffect(() => {
    useStatic.getActions().setToolCallsSignature(toolCallsSignature);
  }, [toolCallsSignature]);

  useEffect(() => {
    useStatic.getActions().setStaticList(staticListRef.current);
  }, [visibleStaticLength, toolCallsSignature, hiddenPartCount, mode]);

  useEffect(() => {
    useDynamic.getActions().setDynamicList(dynamicListRef.current);
  }, [dynamicSignature, visibleStaticLength, mode]);

  return null;
};
