/**
 * Default-on `messages` delta encoding for agent-session SSE connections.
 *
 * The session's `messages` channel payload is always the full UIMessage array
 * (the LocalAgentSession contract). Over SSE that means every streaming text
 * delta re-serializes the whole conversation. The events route feeds every
 * `messages` event through this writer, which converts consecutive full arrays
 * into self-describing envelopes:
 *
 * - `{kind:"full", messages}` — baseline (re)build
 * - `{kind:"patch", upserted:[{index,message}], removed:[id]}` — sparse update
 *
 * Diffing uses **reference equality** on message objects: the route runs in the
 * same process as the session and StreamProcessor applies immutable updates,
 * so unchanged messages keep their identity across events. Only changed
 * messages are serialized, making per-event cost O(changed) instead of
 * O(session size).
 *
 * Safety nets force a full payload whenever identity diffing could miss a
 * mutation: no baseline, >50% of the array changed, or a periodic interval.
 * Patches are coalesced on a trailing-edge window (~60 ms) matching the
 * client's render throttle; full payloads flush immediately.
 */

/** Trailing-edge coalescing window for patch frames (ms). */
export const PATCH_COALESCE_MS = 60;
/** Safety net: force a full payload after this many events since the last full. */
export const PATCH_SAFETY_NET_EVENTS = 1000;
/** Safety net: force a full payload after this long since the last full (ms). */
export const PATCH_SAFETY_NET_MS = 10_000;

export interface MessagesPatchUpsert {
  index: number;
  message: unknown;
}

export interface MessagesPatchPayload {
  kind: "patch";
  upserted: MessagesPatchUpsert[];
  removed: string[];
}

export interface MessagesFullPayload {
  kind: "full";
  messages: unknown[];
}

export type MessagesDeltaPayload = MessagesPatchPayload | MessagesFullPayload;

type MessageLike = { id?: unknown };

function messageIdOf(message: unknown, index: number): string {
  const id = (message as MessageLike | undefined)?.id;
  return typeof id === "string" && id.length > 0 ? id : `#index:${index}`;
}

export interface MessagesDeltaWriter {
  /** Feed the next full `messages` array from the session. */
  push(messages: unknown[]): void;
  /** Drop pending coalesced patches (connection closed). */
  close(): void;
}

export function createMessagesDeltaWriter(write: (payload: MessagesDeltaPayload) => void): MessagesDeltaWriter {
  let baselineIds: string[] = [];
  let baselineRefs = new Map<string, unknown>();
  let eventsSinceFull = 0;
  let lastFullAt = Date.now();
  const pendingUpserts = new Map<string, MessagesPatchUpsert>();
  const pendingRemoved = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const sendFull = (messages: unknown[]): void => {
    baselineIds = messages.map(messageIdOf);
    baselineRefs = new Map(messages.map((message, index) => [messageIdOf(message, index), message]));
    eventsSinceFull = 0;
    lastFullAt = Date.now();
    pendingUpserts.clear();
    pendingRemoved.clear();
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    write({ kind: "full", messages });
  };

  const flush = (): void => {
    timer = null;
    if (pendingUpserts.size === 0 && pendingRemoved.size === 0) return;
    // Indices are resolved against the latest baseline order so a coalesced
    // patch never carries stale positions after mid-array shifts.
    const upserted = [...pendingUpserts.values()].map((upsert) => ({
      index: baselineIds.indexOf(messageIdOf(upsert.message, upsert.index)),
      message: upsert.message,
    }));
    const removed = [...pendingRemoved];
    pendingUpserts.clear();
    pendingRemoved.clear();
    write({ kind: "patch", upserted, removed });
  };

  const schedule = (): void => {
    if (timer !== null) return;
    timer = setTimeout(flush, PATCH_COALESCE_MS);
    (timer as unknown as { unref?: () => void }).unref?.();
  };

  return {
    push(messages: unknown[]): void {
      eventsSinceFull += 1;
      const safetyDue = eventsSinceFull > PATCH_SAFETY_NET_EVENTS || Date.now() - lastFullAt > PATCH_SAFETY_NET_MS;

      const upserted: MessagesPatchUpsert[] = [];
      const nextIds: string[] = [];
      for (let index = 0; index < messages.length; index += 1) {
        const message = messages[index];
        const id = messageIdOf(message, index);
        nextIds.push(id);
        if (baselineRefs.get(id) !== message) upserted.push({ index, message });
      }
      const nextIdSet = new Set(nextIds);
      const removed = baselineIds.filter((id) => !nextIdSet.has(id));

      const changed = upserted.length + removed.length;
      if (baselineRefs.size === 0 || safetyDue || changed * 2 > messages.length) {
        sendFull(messages);
        return;
      }
      if (changed === 0) return;

      for (const id of removed) {
        pendingRemoved.add(id);
        pendingUpserts.delete(id);
      }
      for (const upsert of upserted) {
        const id = messageIdOf(upsert.message, upsert.index);
        pendingRemoved.delete(id);
        pendingUpserts.set(id, upsert);
      }

      // Baseline advances immediately so the next event diffs against the
      // latest state; the coalesced flush sends everything accumulated so far.
      baselineIds = nextIds;
      for (const id of removed) baselineRefs.delete(id);
      for (const upsert of upserted) baselineRefs.set(messageIdOf(upsert.message, upsert.index), upsert.message);
      schedule();
    },

    close(): void {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      pendingUpserts.clear();
      pendingRemoved.clear();
    },
  };
}
