import { Box, Text } from "ink";
import { StreamMarkdown } from "ink-stream-markdown";

import { useSize } from "../hooks";
import { COLORS } from "../theme/colors.js";
import { markdownTheme } from "../theme/markdown-theme.js";

import type { TextPart } from "@tanstack/ai";

export interface TextPartViewProps {
  part: TextPart;
  role: string;
}

/**
 * Streaming parse options for live text parts.
 *
 * Enables ink-stream-markdown's incremental stream parse: the single `md` instance
 * created by `StreamMarkdown` is reused across re-renders, and `streamParse: "auto"`
 * (plus stable top-level node reuse) makes the underlying parser cache safe-markdown
 * transforms, line offsets and previously parsed stable nodes while only re-parsing
 * the appended tail. Static views (plan preview, compaction summary) intentionally
 * keep the library default `{ final: true }` one-shot parse.
 */
const STREAMING_PARSE_OPTIONS = { streamParse: "auto", reuseStableTopLevelNodes: true } as const;

/** Render a text part for assistant messages (user messages are handled by UserMessageView) */
export const TextPartView = ({ part }: TextPartViewProps) => {
  const width = useSize((s) => s.state.screenWidth);

  return (
    <Box flexDirection="row">
      <Box flexShrink={0}>
        <Text color={COLORS.accent}>{"✦ "}</Text>
      </Box>
      <StreamMarkdown theme={{ ...markdownTheme, width: width - 6 }} parseOptions={STREAMING_PARSE_OPTIONS}>
        {part.content.trimEnd()}
      </StreamMarkdown>
    </Box>
  );
};
