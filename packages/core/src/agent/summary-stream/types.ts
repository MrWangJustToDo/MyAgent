/**
 * Summary stream protocol — explicit reset/append/end (task + compact).
 */

export type SummaryStreamSource = "task" | "compact";

export type SummaryStreamStatus = "idle" | "active" | "ended";

export function summaryStreamKey(source: SummaryStreamSource, id: string): string {
  return `${source}:${id}`;
}

/**
 * Stable compact-stream id for an agent.
 *
 * Compaction is single-flight per parent agent (status `compacting`), and the
 * hub lives on that parent — so a random id is unnecessary. Reusing the agent id
 * keeps the key predictable (`compact:${agentId}`) for remount / UI subscribe.
 */
export function compactSummaryStreamId(agentId: string): string {
  return agentId;
}

export interface SummaryStreamSnapshot {
  key: string;
  source: SummaryStreamSource;
  /** Present when source is task. */
  toolCallId?: string;
  /** Present when source is compact. */
  compactId?: string;
  seq: number;
  /** Closed complete lines (ring-capped on the producer). */
  lines: string[];
  /** Incomplete trailing line (may be empty). */
  pendingLine: string;
  status: SummaryStreamStatus;
}

export type SummaryStreamEvent =
  | {
      type: "reset";
      key: string;
      source: SummaryStreamSource;
      toolCallId?: string;
      compactId?: string;
      seq: number;
    }
  | { type: "append"; key: string; chunk: string; seq: number }
  | { type: "end"; key: string; seq: number };

export type SummaryStreamListener = (event: SummaryStreamEvent) => void;
