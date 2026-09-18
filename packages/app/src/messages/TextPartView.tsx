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
 * keep the one-shot parse.
 */
const STREAMING_PARSE_OPTIONS = { streamParse: "auto", reuseStableTopLevelNodes: true } as const;

/**
 * `streaming` is REQUIRED here, not decorative.
 *
 * 0.0.11 resolves the parse mode as `parseOptions?.final ?? !streaming`, and its default is
 * `streaming = false`. Before then the resolver was "use `parseOptions` verbatim once it
 * mentions `final` OR `streamParse`" — which `STREAMING_PARSE_OPTIONS` satisfies via
 * `streamParse`, keeping the incremental path. Under the new resolver that same object
 * reports no `final`, so the default flips to `final: true` and every live text part is
 * re-parsed whole on every chunk: the streaming cache never engages.
 *
 * Passing `streaming` restores the previous semantics exactly (`final` resolves to `false`).
 * No `height` is set, so the tail-anchored window that `streaming` also drives is inert.
 */

/** Render a text part for assistant messages (user messages are handled by UserMessageView) */
export const TextPartView = ({ part }: TextPartViewProps) => {
  const width = useSize((s) => s.state.screenWidth);

  return (
    <Box flexDirection="row">
      <Box flexShrink={0}>
        <Text color={COLORS.accent}>{"✦ "}</Text>
      </Box>
      <StreamMarkdown theme={{ ...markdownTheme, width: width - 6 }} parseOptions={STREAMING_PARSE_OPTIONS} streaming>
        {part.content.trimEnd()}
      </StreamMarkdown>
    </Box>
  );
};
