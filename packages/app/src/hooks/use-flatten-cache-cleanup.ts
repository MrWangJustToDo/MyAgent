import { useEffect } from "react";
import { toRaw } from "reactivity-store";

import { clearStaticFlattenNamespace } from "../utils/message-flat-cache.js";

import { useAgent } from "./use-agent.js";

/**
 * Drop a destroyed agent's flatten snapshots.
 *
 * The flatten snapshot is keyed by agent id (see `message-flat-cache`). Unlike the main
 * transcript, a subagent preview passes no `window`, so its snapshot retains the FULL
 * transcript's per-message row arrays. Without this the entry would sit in the map until
 * LRU eviction, holding a dead agent's whole transcript.
 *
 * Reuse is gated on message IDENTITY, so a missed cleanup can never render a wrong frame —
 * this is purely a memory concern, which is why it is best-effort and never throws.
 *
 * Mounted once at the app root rather than inside a preview panel: the panel unmounts when
 * the user navigates away, but the agent can be destroyed at any later point (e.g. the
 * parent run finishing while the task list is on screen), so the observer must outlive it.
 */
export function useFlattenCacheCleanup(): void {
  const session = toRaw(useAgent((s) => s.session));

  useEffect(() => {
    if (!session) return;

    // `subagent:destroyed` is emitted on the child with a `parentId`, so it surfaces on the
    // parent's stream. The destroyed agent's id is the event's own `agentId` (the payload's
    // `subagentId` is the same value, kept optional for older emitters).
    return session.subscribe(
      (event) => {
        if (event.channel !== "lifecycle") return;
        if (event.payload.type !== "subagent:destroyed") return;
        const destroyedId = event.payload.payload?.subagentId ?? event.payload.agentId;
        if (destroyedId) clearStaticFlattenNamespace(destroyedId);
      },
      { channels: ["lifecycle"] }
    );
  }, [session]);
}
