import { throttle } from "lodash-es";
import { useEffect, useState } from "react";
import { toRaw } from "reactivity-store";

import { resolveAgentSession } from "../utils/session-resolve.js";

import { useAgent } from "./use-agent.js";

import type { UIMessage } from "@tanstack/ai";

function readSubagentMessages(subagentId: string): UIMessage[] {
  return (resolveAgentSession(subagentId)?.getSnapshot().messages ?? []) as UIMessage[];
}

/**
 * Subscribe to live UIMessage snapshots for a subagent preview via Host.connect.
 */
export function useSubagentMessages(subagentId: string | undefined): UIMessage[] {
  const rootSession = toRaw(useAgent((s) => s.session));
  const [messages, setMessages] = useState<UIMessage[]>(() => (subagentId ? readSubagentMessages(subagentId) : []));

  useEffect(() => {
    if (!subagentId) {
      setMessages([]);
      return;
    }

    // `messages` events fire per stream chunk (often >50/s). Rendering a huge
    // transcript that often freezes the UI, so all channels go through one
    // trailing throttle: state/lifecycle refreshes coalesce into it, and the
    // chunk path only forces an earlier flush (never bypasses the interval).
    let pendingMessages: UIMessage[] | null = null;
    const flush = () => setMessages(pendingMessages ?? readSubagentMessages(subagentId));
    const throttledFlush = throttle(flush, 200, { leading: false, trailing: true });

    let childUnsub: (() => void) | undefined;
    const attachChild = () => {
      childUnsub?.();
      childUnsub = undefined;
      const child = resolveAgentSession(subagentId);
      if (!child) return;
      childUnsub = child.subscribe(
        (event) => {
          if (event.channel === "messages") {
            pendingMessages = event.payload as UIMessage[];
            throttledFlush();
            return;
          }
          pendingMessages = null;
          throttledFlush();
        },
        { channels: ["messages", "state", "lifecycle"] }
      );
    };

    attachChild();
    setMessages(readSubagentMessages(subagentId));

    let rootUnsub: (() => void) | undefined;
    if (rootSession) {
      rootUnsub = rootSession.subscribe(
        (event) => {
          if (event.channel !== "lifecycle") return;
          if (event.payload.agentId !== subagentId) return;
          if (
            event.payload.type === "subagent:created" ||
            event.payload.type === "subagent:started" ||
            event.payload.type === "subagent:ui-update"
          ) {
            attachChild();
            pendingMessages = null;
            throttledFlush();
          }
        },
        { channels: ["lifecycle"] }
      );
    }

    return () => {
      childUnsub?.();
      rootUnsub?.();
      throttledFlush.cancel();
    };
  }, [subagentId, rootSession]);

  return messages;
}
