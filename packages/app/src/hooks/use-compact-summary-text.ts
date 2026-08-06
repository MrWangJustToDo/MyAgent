/**
 * Subscribe to the compact summary stream and accumulate raw text.
 * Active when status === "compacting".
 * Returns the raw summary text (without [CONVERSATION SUMMARY] wrapping).
 */

import { agentManager, summaryStreamKey, type SummaryStreamEvent } from "@my-agent/core";
import { useEffect, useRef, useState } from "react";

import { useAgent } from "./use-agent.js";

export interface UseCompactSummaryTextOptions {
  enabled?: boolean;
}

/**
 * Accumulate the compact summary stream text for the root agent.
 * Compact keys are stable: `compact:${agentId}`.
 */
export function useCompactSummaryText(options?: UseCompactSummaryTextOptions): string {
  const enabled = options?.enabled ?? true;
  const rootAgentId = useAgent((s) => s.agent?.id);
  const [text, setText] = useState("");
  const textRef = useRef("");

  useEffect(() => {
    if (!enabled || !rootAgentId) {
      textRef.current = "";
      setText("");
      return;
    }

    const managed = agentManager.getAgent(rootAgentId);
    if (!managed) {
      textRef.current = "";
      setText("");
      return;
    }

    const hub = managed.summaryStreams;
    if (!hub) {
      textRef.current = "";
      setText("");
      return;
    }

    const key = summaryStreamKey("compact", rootAgentId);

    const handleEvent = (event: SummaryStreamEvent) => {
      if (event.key !== key) return;
      if (event.type === "reset") {
        textRef.current = "";
        setText("");
        return;
      }
      if (event.type === "append") {
        textRef.current += event.chunk;
        setText(textRef.current);
        return;
      }
      // "end" — keep the final accumulated text, no further updates.
    };

    const unsub = hub.subscribe(handleEvent);

    // Snapshot: if there's already active data, capture it.
    const snap = hub.getSnapshot(key);
    if (snap && snap.status === "active") {
      const raw = [...snap.lines, snap.pendingLine].filter(Boolean).join("");
      textRef.current = raw;
      setText(raw);
    }

    return () => {
      unsub();
    };
  }, [enabled, rootAgentId]);

  return text;
}
