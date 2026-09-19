import { Box, Text } from "ink";
import { StreamMarkdown } from "ink-stream-markdown";
import { memo } from "react";

import { useStaticContext } from "../context/static-context.js";
import { useSize } from "../hooks";
import { BG } from "../theme/colors";
import { markdownTheme } from "../theme/markdown-theme.js";
import { extractCompactionSummaryBody } from "../utils/compaction-summary.js";

import type { TextPart, UIMessage } from "../hooks";

/**
 * Visible lines for the summary body. Longer summaries fold behind the library's
 * fold-indicator line rather than growing without bound.
 *
 * A compact summary is the full conversation's digest, so it is easily hundreds of lines
 * — and `MessageList` budgets the static region by MEASURED height (`MAX_STATIC_LINES`),
 * so an unbounded one crowds real messages out of the scrollback and can exceed the
 * viewport on its own. This is display-only: the model still receives the whole summary.
 *
 * Same idea as `LiteDiff`'s `maxLines`; deliberately a single named constant so the
 * budget is one line to tune.
 */
const COMPACT_SUMMARY_MAX_LINES = 30;

export const CompactionSummaryView = memo(function CompactionSummaryView({ message }: { message: UIMessage }) {
  const screenWidth = useSize((s) => s.state.screenWidth);
  const contentWidth = screenWidth - 2;

  const { staticMessage } = useStaticContext();

  const part = message.parts[0] as TextPart;
  // Strip the outer [CONVERSATION SUMMARY] / [END SUMMARY] markers and
  // "Continue if you have next steps..." instruction — we already have our
  // own visual header (── compact checkpoint ──).
  const displayContent = extractCompactionSummaryBody(part.content) ?? part.content;

  return (
    <Box
      flexDirection="column"
      width={contentWidth}
      borderStyle="single"
      borderColor={BG.border}
      borderTop
      borderBottom
      padding={1}
    >
      <Box justifyContent="center" width={"100%"}>
        <Text>── compact checkpoint ──</Text>
      </Box>
      <StreamMarkdown
        theme={{ ...markdownTheme, width: contentWidth - 2 }}
        height={COMPACT_SUMMARY_MAX_LINES}
        // Two different messages reach this view and they want opposite parse modes. The
        // finished checkpoint is static content: `final` one-shot parse with the fold at the
        // bottom, so it reads from its own start. The summary `MessageViewWithCompact`
        // injects WHILE compaction runs is still arriving, and wants the streaming path —
        // otherwise a growing summary renders as if it had already finished.
        streaming={!staticMessage}
      >
        {displayContent.trimEnd()}
      </StreamMarkdown>
    </Box>
  );
});

CompactionSummaryView.displayName = "CompactionSummaryView";
