/**
 * MessageList - Renders a list of UIMessages with their parts.
 *
 * Uses AI SDK's UIMessage format with parts (text, reasoning, tool-*, etc).
 * Static messages are capped to limit terminal output and improve performance.
 */

import { Box, Text } from "ink";
import { useEffect, useRef } from "react";

import { StaticContext } from "../context/static-context.js";
import { TranscriptDisplayContext } from "../context/transcript-display-context.js";
import { useAgent } from "../hooks/use-agent.js";
import { useDynamic } from "../hooks/use-dynamic";
import { useStatic } from "../hooks/use-static";
import { useTranscriptDisplay } from "../hooks/use-transcript-display.js";
import { MessageView } from "../messages";
import { COLORS } from "../theme/colors.js";
import { encodeToolCallState } from "../utils/dedupe-tool-calls";
import { countSourceMessages, getMessages } from "../utils/get-messages";
import { flattenNamespaceFor } from "../utils/message-flat-cache.js";

import { CursorFlush } from "./CursorFlush";

import type { UIMessage } from "@tanstack/ai";
import type { JSX } from "react";

// ============================================================================
// Constants
// ============================================================================

/** Maximum number of completed (static) rows to render. Older rows are truncated with a marker. */
const MAX_STATIC_PARTS = 100;

/**
 * How many messages enter the static derivation (`getMessages`). Bounds the per-render
 * cost — digest, flatten and tool fingerprint — by a constant instead of by session
 * length. The window start snaps back to a user-message boundary, so the effective
 * count can exceed this slightly.
 */
const STATIC_INPUT_WINDOW = 120;

/** Fallback namespace when no session is bound yet (pre-bootstrap renders). */
const FLATTEN_NAMESPACE_FALLBACK = "transcript";

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
        return `${m.id}:${encodeToolCallState(tool)}`;
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
  // Namespace by the owning agent so this transcript's snapshot cannot be evicted by a
  // subagent preview (and vice versa). `session` is the live AgentSession handle for the
  // active agent; before it is bound, fall back to a shared slot.
  const session = useAgent((s) => s.session);
  const namespace = session ? flattenNamespaceFor(session.id) : FLATTEN_NAMESPACE_FALLBACK;
  const { staticMessages, dynamicMessages, toolCallsSignature, hiddenSourceMessages } = getMessages(messages, {
    mode,
    window: STATIC_INPUT_WINDOW,
    namespace,
  });

  // ── Truncate static list to bounded size ──
  // Everything here is counted in MESSAGES (never rows): `hiddenSourceMessages` covers the
  // window prefix plus static messages that produced no row, and the rendered-row cap adds
  // the messages behind the rows it drops. Mixing the two units would print a total that
  // exceeds the transcript length.
  const hiddenPartCount = staticMessages.length > MAX_STATIC_PARTS ? staticMessages.length - MAX_STATIC_PARTS : 0;
  const visibleStaticMessages = hiddenPartCount > 0 ? staticMessages.slice(-MAX_STATIC_PARTS) : staticMessages;
  const visibleStaticLength = visibleStaticMessages.length;
  // `staticMessages` is the source for the rows the cap drops. Counting is split by role
  // inside `countSourceMessages`, so no id needs to be seeded here.
  const hiddenTotal =
    hiddenSourceMessages + (hiddenPartCount > 0 ? countSourceMessages(staticMessages.slice(0, -MAX_STATIC_PARTS)) : 0);
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

    if (hiddenTotal > 0) {
      elements.unshift(
        <Box key="truncation-marker" paddingX={1} marginTop={1}>
          <Text color={COLORS.muted} dimColor>
            ... {hiddenTotal} older message{hiddenTotal === 1 ? "" : "s"} hidden
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
