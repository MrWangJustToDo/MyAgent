/** Format duration in milliseconds to a human-readable string */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
}

export { formatToolInput } from "./tool-input-format.js";
export { formatToolArgs, formatToolOutput } from "./tool-output-format.js";
export {
  DURATION_THRESHOLD_MS,
  buildToolHeader,
  getCompactOutput,
  getDurationMs,
  getInlineSummary,
  getToolCallColor,
} from "./tool-display.js";
