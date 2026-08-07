/**
 * Subscribe to a keyed summary stream (task / compact) via AgentSession.
 * subscribe → snapshot must run in the same synchronous block.
 */

import {
  agentManager,
  applyAppendToDisplayWindow,
  createLocalAgentSession,
  displayWindowFromSnapshot,
  emptySummaryDisplayWindow,
  renderSummaryDisplayRows,
  summaryStreamKey,
  type SummaryDisplayWindow,
  type SummaryStreamEvent,
  type SummaryStreamSource,
} from "@my-agent/core";
import { useEffect, useMemo, useState } from "react";

import { useAgent } from "./use-agent.js";

export interface UseSummaryStreamOptions {
  enabled?: boolean;
  /** Total rows including overflow indicator (default: 5). */
  maxLines?: number;
  source: SummaryStreamSource;
  /** Required for source=task. */
  toolCallId?: string;
  /** Required for source=compact. */
  compactId?: string;
  agentId?: string;
}

export interface UseSummaryStreamResult {
  rows: string[];
  hidden: number;
  status: "idle" | "active" | "ended" | "missing";
  pendingLine: string;
}

function resolveKey(options: UseSummaryStreamOptions): string | undefined {
  if (options.source === "task") {
    return options.toolCallId ? summaryStreamKey("task", options.toolCallId) : undefined;
  }
  return options.compactId ? summaryStreamKey("compact", options.compactId) : undefined;
}

/**
 * Live summary window for one stream key.
 */
export function useSummaryStream(options: UseSummaryStreamOptions): UseSummaryStreamResult {
  const enabled = options.enabled ?? true;
  const maxLines = options.maxLines ?? 5;
  const contentSlots = Math.max(1, maxLines - 1);
  const key = resolveKey(options);
  const rootAgentId = useAgent((s) => s.agent?.id);
  const agentId = options.agentId || rootAgentId;

  const [windowState, setWindowState] = useState<SummaryDisplayWindow>(() => emptySummaryDisplayWindow());
  const [status, setStatus] = useState<UseSummaryStreamResult["status"]>("missing");

  useEffect(() => {
    if (!enabled || !agentId || !key) {
      setWindowState(emptySummaryDisplayWindow());
      setStatus("missing");
      return;
    }

    const managed = agentManager.getAgent(agentId);
    if (!managed) {
      setWindowState(emptySummaryDisplayWindow());
      setStatus("missing");
      return;
    }

    const session = createLocalAgentSession({ managed, manager: agentManager });

    const applyEvent = (event: SummaryStreamEvent) => {
      if (event.key !== key) return;
      if (event.type === "reset") {
        setWindowState(emptySummaryDisplayWindow());
        setStatus("active");
        return;
      }
      if (event.type === "append") {
        setWindowState((prev) => applyAppendToDisplayWindow(prev, event.chunk, contentSlots));
        setStatus("active");
        return;
      }
      if (event.type === "end") {
        setStatus("ended");
      }
    };

    // Critical: subscribe then snapshot in the same sync block (no await between).
    const unsub = session.subscribe(
      (evt) => {
        if (evt.channel !== "summary") return;
        applyEvent(evt.payload);
      },
      { channels: ["summary"] }
    );
    const snap = session.getSummaryStreamSnapshot(key);
    if (snap) {
      setWindowState(displayWindowFromSnapshot(snap, contentSlots));
      setStatus(snap.status === "idle" ? "missing" : snap.status);
    } else {
      setWindowState(emptySummaryDisplayWindow());
      setStatus("missing");
    }

    return () => {
      unsub();
    };
  }, [enabled, agentId, key, contentSlots]);

  return useMemo(() => {
    const rendered = renderSummaryDisplayRows(windowState, maxLines);
    return {
      rows: rendered.rows,
      hidden: rendered.hidden,
      status,
      pendingLine: windowState.pendingLine,
    };
  }, [windowState, maxLines, status]);
}
