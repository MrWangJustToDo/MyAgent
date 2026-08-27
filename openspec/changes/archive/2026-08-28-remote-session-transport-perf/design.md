# Design — Remote Session Transport Performance

## Context

The remote session plane (`packages/server/src/routes/agent-session.ts` + `remote-session-client.ts`) forwards every `AgentSessionEvent` as one SSE frame: `JSON.stringify({channel, payload, ts})`. The `messages` channel payload is the **full** `TanStackUIMessage[]`, emitted by `AgentUIChannel.handleMessagesChange` on every StreamProcessor mutation — including every `TEXT_MESSAGE_CONTENT` delta. With real sessions at 16–18 MB of uiMessages, each text delta re-sends the whole conversation; the client `JSON.parse`s it again per frame. Local mode is unaffected (in-process reference passing) and already throttles UI updates to 60 ms (`use-agent-chat.ts`).

Constraints discovered during analysis:
- The SSE route runs **in the same process** as the session, so message object identity is observable: StreamProcessor uses immutable updates (`map`/spread), leaving unchanged message objects referentially equal across events.
- The client already throttles rendering to ~60 ms, so per-delta frame cadence buys nothing visually.
- Compat matters: server and CLI ship from the same repo, but a mixed fleet (old client vs new server) must keep working.

## Goals / Non-Goals

**Goals:**
- Reduce per-delta wire cost from O(session size) to O(changed messages) in remote mode.
- Reduce connect/resync transfer for large sessions (snapshot routes).
- Keep default behavior byte-compatible for clients that do not opt in.
- Fix identified O(n²)/waste spots (tool buffer concat, per-frame timestamp revival, diagnostic logging, stale shell usage shape).

**Non-Goals:**
- Changing the core `messages` channel contract (local subscribers keep full arrays).
- Delta-izing other event channels — payloads are already small or inherently incremental:
  - task/subagent summary streams use the `SummaryStreamHub` append protocol (`{type:"append", chunk, seq}`);
  - `lifecycle` subagent phase events, `state`, `queues`, `usage`, `todos`, `plan` are small payloads;
  - subagent (task) sessions are separate AgentSessions with their own SSE connections through the same `RemoteSessionClient`, so the messages delta applies to them automatically — no special handling;
  - commands (`POST /:id/command`) are one-shot REST; state changes propagate via event channels with no full-snapshot refetch (existing behavior).
- General-purpose SSE compression (latency/flush semantics); REST-only.
- Touching the app-layer subscription hooks or `use-agent-chat` throttling.

## Decisions

1. **Envelope encoding is unconditional on the server** (no query-param negotiation).
   *Why*: server and client ship from the same build (`pnpm build` produces both dists), so a capability handshake protects against a deployment model that does not exist here. The accepted residual risk is the transient window where an old dist server keeps running after a code pull — an old client would misrender patch envelopes; the reverse direction (new client, old server) stays safe because the client treats plain arrays as legacy full payloads. *Alternative considered*: `?messages=delta` opt-in — rejected as ceremony for a single-binary deployment; revisitable if mixed-version fleets materialize.

2. **Server-side reference-equality diff** (per SSE connection): cache `Map<messageId, messageRef>` of the last sent array; per event, a message is "changed" iff its object reference differs. Serialize **only** changed messages.
   *Why*: zero-cost comparison (no O(total) serialization per event — that would keep the CPU waste we are removing), exact for StreamProcessor's immutable updates. The route is in-process with the session, so identity is meaningful. *Alternative*: content hashing per message — O(total) CPU per delta, rejected.

3. **Patch frame shape**: `{channel:"messages", payload:{kind:"patch", upserted:[{index, message}], removed:[id...]}}`; full frame: `{kind:"full", messages:[...]}`. `index` lets the client splice precisely, avoiding order drift from mid-array inserts (compaction truncation, message slicing).
   Client merge order: apply `removed` (filter by id), then `upserted` ascending by `index` (replace in place when the id already occupies that position, else splice). Unknown `kind` → client triggers `resync()` (self-healing).

4. **Safety nets against missed mutations** (in-place mutation or future processor changes): send `full` when (a) the connection has no cache yet, (b) changed+removed exceeds half the array, or (c) every `FULL_REFRESH_INTERVAL` events (1000) / 10 s have elapsed since the last full. A periodic full also bounds any client drift.

5. **60 ms trailing-edge coalescing of patches per connection**: consecutive `messages` events within the window merge into one frame (later patch wins per id; removals after upserts drop the upsert). A `full` flushes immediately and discards pending patches. The window matches the client render throttle — no observable latency added. *Alternative*: micro-batch all channels with a timer — rejected for now; other channels are low-rate or latency-sensitive (`tool`).

6. **Compression via per-route `hono/compress` middleware** on `/:id/snapshot`, `/:id/tool-buffers`, `/:id/summary-streams` only — never on `/events`. Node fetch clients send `Accept-Encoding: gzip` and decompress transparently. *Alternative*: app-level compress with path filter — rejected, one misconfiguration away from buffering the SSE stream; per-route keeps the streaming route structurally untouched.

7. **Tool buffer storage**: replace `current + chunk` (full copy per chunk) with `{chunks: string[], bytes: number}` and cap by dropping head chunks; join lazily on read (`/:id/tool-buffers`). Same 256 KB cap semantics.

8. **Cleanups**: `reviveMessageTimestamps` runs only when a full message array is applied (not per patch — patches revive their own messages); `[agent-diag]` logs emit only when `AGENT_SESSION_DEBUG=1`; the client shell snapshot's usage is corrected to `UsageChangeSnapshot` shape (`{total, window, percent, tokenLimit, cost}`).

## Risks / Trade-offs

- [StreamProcessor starts mutating messages in place] → reference diff misses updates → periodic full resync (every 1000 events / 10 s) plus the >50%-changed heuristic bounds staleness; reconnect always resyncs full.
- [Patch merge drift on exotic orderings] → `index`-based splice + periodic full keeps drift bounded to one interval; unknown payloads trigger resync.
- [Mixed old-server/new-client] → client treats a missing `kind` as a plain array (legacy full) — both directions degrade to today's behavior. Accepted residual risk: old-client + new-server during the pre-restart window (same-build deployment makes this transient).
- [gzip CPU on 18 MB snapshots] → only on connect/resync (not per frame); gzip level default is acceptable; can add `zlib` sync-level tuning later if measured.
- [Coalescing adds ≤60 ms latency to text] → invisible: client renders at 60 ms cadence anyway.

## Migration Plan

1. Ship server + client together (same repo). The server encodes `messages` envelopes unconditionally; the client also tolerates plain-array payloads for the old-server direction.
2. Rollback: revert the server encoding — the client falls back to plain arrays with no other behavioral change.
3. Validation: `validate:agent-session-http`-style round-trip script extended with patch-merge cases; manual long-session remote smoke test comparing rendered output vs local mode.

## Open Questions

- None blocking. (If mixed-version fleets materialize, consider advertising `messages=delta` support in the session catalog response.)
