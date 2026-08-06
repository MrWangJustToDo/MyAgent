/**
 * Per-agent multi-key summary stream hub (task + compact).
 */

import { Emitter } from "../../utils/emitter.js";

import { applySummaryStreamAppend, emptySummaryLineBuffer, SUMMARY_STREAM_SNAPSHOT_LINE_CAP } from "./line-buffer.js";
import {
  summaryStreamKey,
  type SummaryStreamEvent,
  type SummaryStreamListener,
  type SummaryStreamSnapshot,
  type SummaryStreamSource,
} from "./types.js";

interface StreamEntry {
  source: SummaryStreamSource;
  toolCallId?: string;
  compactId?: string;
  seq: number;
  lines: string[];
  pendingLine: string;
  status: SummaryStreamSnapshot["status"];
}

type SummaryStreamHubEvents = {
  event: SummaryStreamEvent;
};

export interface SummaryStreamResetInput {
  source: SummaryStreamSource;
  /** Required for source=task. */
  toolCallId?: string;
  /** Required for source=compact. */
  compactId?: string;
}

function resolveId(input: SummaryStreamResetInput): string {
  if (input.source === "task") {
    if (!input.toolCallId) throw new Error("summary stream reset(task) requires toolCallId");
    return input.toolCallId;
  }
  if (!input.compactId) throw new Error("summary stream reset(compact) requires compactId");
  return input.compactId;
}

/**
 * Owns summary stream state for one ManagedAgent and multicasts events to listeners.
 */
export class SummaryStreamHub {
  private readonly streams = new Map<string, StreamEntry>();
  private readonly events = new Emitter<SummaryStreamHubEvents>();

  subscribe(listener: SummaryStreamListener): () => void {
    return this.events.on("event", listener);
  }

  getSnapshot(key: string): SummaryStreamSnapshot | null {
    const entry = this.streams.get(key);
    if (!entry) return null;
    return this.toSnapshot(key, entry);
  }

  listSnapshots(): SummaryStreamSnapshot[] {
    return [...this.streams.entries()].map(([key, entry]) => this.toSnapshot(key, entry));
  }

  reset(input: SummaryStreamResetInput): SummaryStreamSnapshot {
    const id = resolveId(input);
    const key = summaryStreamKey(input.source, id);
    const entry: StreamEntry = {
      source: input.source,
      ...(input.toolCallId ? { toolCallId: input.toolCallId } : {}),
      ...(input.compactId ? { compactId: input.compactId } : {}),
      seq: 1,
      ...emptySummaryLineBuffer(),
      status: "active",
    };
    this.streams.set(key, entry);
    this.emit({
      type: "reset",
      key,
      source: input.source,
      ...(input.toolCallId ? { toolCallId: input.toolCallId } : {}),
      ...(input.compactId ? { compactId: input.compactId } : {}),
      seq: entry.seq,
    });
    return this.toSnapshot(key, entry);
  }

  append(key: string, chunk: string): void {
    if (!chunk) return;
    const entry = this.streams.get(key);
    if (!entry || entry.status === "idle") return;
    if (entry.status === "ended") {
      // Late chunks after end are ignored.
      return;
    }

    const next = applySummaryStreamAppend({ lines: entry.lines, pendingLine: entry.pendingLine }, chunk, {
      maxCompleteLines: SUMMARY_STREAM_SNAPSHOT_LINE_CAP,
    });
    entry.lines = next.lines;
    entry.pendingLine = next.pendingLine;
    entry.seq += 1;
    this.emit({ type: "append", key, chunk, seq: entry.seq });
  }

  end(key: string): void {
    const entry = this.streams.get(key);
    if (!entry) return;
    if (entry.status === "ended") return;
    entry.status = "ended";
    entry.seq += 1;
    this.emit({ type: "end", key, seq: entry.seq });
  }

  /** Drop a stream entirely (optional cleanup after UI unmount). */
  clear(key: string): void {
    this.streams.delete(key);
  }

  private toSnapshot(key: string, entry: StreamEntry): SummaryStreamSnapshot {
    return {
      key,
      source: entry.source,
      ...(entry.toolCallId ? { toolCallId: entry.toolCallId } : {}),
      ...(entry.compactId ? { compactId: entry.compactId } : {}),
      seq: entry.seq,
      lines: entry.lines.slice(),
      pendingLine: entry.pendingLine,
      status: entry.status,
    };
  }

  private emit(event: SummaryStreamEvent): void {
    this.events.emit("event", event);
  }
}
