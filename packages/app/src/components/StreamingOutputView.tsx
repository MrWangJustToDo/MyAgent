/**
 * StreamingOutputView — Standalone component for displaying streaming tool output.
 *
 * Can be used independently for testing or embedded in other components.
 */

import { Box, Text } from "ink";

import { useStreamingOutput } from "../hooks/use-streaming-output.js";

// ============================================================================
// Types
// ============================================================================

export interface StreamingOutputViewProps {
  /** Tool call ID to subscribe to */
  toolCallId: string | undefined;
  /** Whether to enable streaming */
  enabled?: boolean;
  /** Max lines to show from stdout (default: 5) */
  maxStdoutLines?: number;
  /** Max lines to show from stderr (default: 3) */
  maxStderrLines?: number;
  /** Custom empty state message */
  emptyMessage?: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Display streaming output for a tool call.
 *
 * @example
 * ```tsx
 * <StreamingOutputView toolCallId="call-123" enabled={true} />
 * ```
 */
export const StreamingOutputView = ({
  toolCallId,
  enabled = true,
  maxStdoutLines = 5,
  maxStderrLines = 3,
  emptyMessage = "Waiting for output...",
}: StreamingOutputViewProps) => {
  const output = useStreamingOutput(toolCallId, enabled);

  if (!output || (!output.stdout && !output.stderr)) {
    return (
      <Box paddingLeft={2}>
        <Text color="gray" dimColor>
          {emptyMessage}
        </Text>
      </Box>
    );
  }

  const stdoutLines = output.stdout ? output.stdout.split("\n") : [];
  const stderrLines = output.stderr ? output.stderr.split("\n") : [];

  const hiddenStdoutLines = Math.max(0, stdoutLines.length - maxStdoutLines);
  const hiddenStderrLines = Math.max(0, stderrLines.length - maxStderrLines);

  const displayStdout = stdoutLines.slice(-maxStdoutLines);
  const displayStderr = stderrLines.slice(-maxStderrLines);

  return (
    <Box flexDirection="column" paddingLeft={2}>
      {displayStdout.length > 0 && (
        <Box flexDirection="column">
          {hiddenStdoutLines > 0 && (
            <Text color="gray" dimColor>
              ... ({hiddenStdoutLines} more lines)
            </Text>
          )}
          {displayStdout.map((line, i) => (
            <Text key={`stdout-${i}`} color="gray" dimColor>
              {line}
            </Text>
          ))}
        </Box>
      )}
      {displayStderr.length > 0 && (
        <Box flexDirection="column">
          {hiddenStderrLines > 0 && (
            <Text color="red" dimColor>
              ... ({hiddenStderrLines} more lines)
            </Text>
          )}
          {displayStderr.map((line, i) => (
            <Text key={`stderr-${i}`} color="red" dimColor>
              {line}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
};
