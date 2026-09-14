/**
 * Thin re-exports of the core-owned activity-summary helpers.
 *
 * Fold buckets, row decisions and summary wording all come from core now — the host
 * must not keep its own tool-name tables (they drifted, and off-process hosts cannot
 * see the registry the tools register into).
 */
export {
  countToolActivity,
  collectOtherToolNames,
  emptyToolActivityCounts,
  extractActivityLabel,
  extractActivityLabelInfo,
  formatExploredActivitySummary,
  formatToolActivitySummary,
  getToolActivityBucket,
  isErrorToolRow,
  shouldFoldToolRow,
  shouldKeepToolRow,
  summarizeToolActivity,
  type ActivityLabel,
  type ToolActivityBucket,
  type ToolActivityCounts,
} from "@my-agent/core";
