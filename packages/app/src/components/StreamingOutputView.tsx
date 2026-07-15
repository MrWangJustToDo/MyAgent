/**
 * Display streaming tool output in a capped-height window (latest N lines).
 */

import { Box, Text } from "ink";

import { useStreamingOutput } from "../hooks/use-streaming-output.js";
import { COLORS } from "../theme/colors.js";
import { buildFixedStreamingWindow } from "../utils/streaming-output-lines.js";

// ============================================================================
// Types
// ============================================================================

export interface StreamingOutputViewProps {
  /** Tool call ID to subscribe to */
  toolCallId: string | undefined;
  /** Whether to enable streaming */
  enabled?: boolean;
  /** Min ms between UI store updates (default: 0 = every chunk). */
  throttleMs?: number;
  /** Max stdout window height in lines (default: 5) */
  maxStdoutLines?: number;
  /** Max stderr window height in lines when stderr is present (default: 3) */
  maxStderrLines?: number;
  /**
   * Optional placeholder when there is no stream content yet.
   * Default: empty — render nothing (no reserved height) until output arrives.
   */
  emptyMessage?: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Display streaming output for a tool call.
 *
 * - No content and no {@link emptyMessage}: renders nothing (no reserved height).
 * - Content grows line-by-line up to {@link maxStdoutLines}, then keeps the latest lines.
 * - Overflow is marked on the first visible line (`… `).
 *
 * @example
 * ```tsx
 * <StreamingOutputView toolCallId="call-123" enabled={true} />
 * ```
 */
export const StreamingOutputView = ({
  toolCallId,
  enabled = true,
  throttleMs = 0,
  maxStdoutLines = 5,
  maxStderrLines = 3,
  emptyMessage = "",
}: StreamingOutputViewProps) => {
  const output = useStreamingOutput(toolCallId, { enabled, throttleMs });

  const stdoutText = output?.stdout ?? "";
  const stderrText = output?.stderr ?? "";
  const hasStdout = stdoutText.length > 0;
  const hasStderr = stderrText.length > 0;

  // Nothing to show yet — do not reserve vertical space.
  if (!hasStdout && !hasStderr && !emptyMessage) {
    return null;
  }

  const stdoutWindow = buildFixedStreamingWindow(stdoutText, maxStdoutLines, {
    emptyPlaceholder: !hasStdout && !hasStderr ? emptyMessage : "",
  });

  const stderrWindow = hasStderr
    ? buildFixedStreamingWindow(stderrText, maxStderrLines)
    : { lines: [] as string[], hidden: 0 };

  if (stdoutWindow.lines.length === 0 && stderrWindow.lines.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" paddingLeft={2}>
      {stdoutWindow.lines.length > 0 && (
        <Box flexDirection="column" height={stdoutWindow.lines.length} flexShrink={0}>
          {stdoutWindow.lines.map((line, i) => (
            <Text key={`stdout-${i}`} color={COLORS.muted} dimColor>
              {line.length > 0 ? line : " "}
            </Text>
          ))}
        </Box>
      )}
      {stderrWindow.lines.length > 0 && (
        <Box flexDirection="column" height={stderrWindow.lines.length} flexShrink={0}>
          {stderrWindow.lines.map((line, i) => (
            <Text key={`stderr-${i}`} color={COLORS.danger} dimColor>
              {line.length > 0 ? line : " "}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
};
