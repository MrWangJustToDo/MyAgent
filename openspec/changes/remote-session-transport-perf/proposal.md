# Remote Session Transport Performance

## Why

In `--remote-session` mode every streaming chunk re-serializes and re-sends the ENTIRE UIMessage array over SSE — the `messages` channel payload is the full conversation, emitted per text delta by TanStack's StreamProcessor. Measured real sessions hold 16–18 MB of uiMessages (1100–1500 messages), so a single streaming turn nominally transfers gigabytes and forces the client to JSON.parse the same volume per frame. Long-session remote streaming is effectively unusable, while local mode is unaffected (in-process reference passing).

## What Changes

- **Messages delta over SSE (default)**: the `/api/agent/:id/events` route encodes every `messages` payload as a self-describing envelope — `{kind:"full"}` baseline or `{kind:"patch"}` sparse update. Per connection, unchanged messages are detected by reference equality (same process as the session) and only changed/inserted/removed messages are serialized; full arrays are sent on first event, reconnect resync, and as a periodic safety net.
- **Patch coalescing**: consecutive messages patches on one SSE connection are coalesced on a 60 ms trailing edge (matching the client's render throttle); a full payload always flushes immediately.
- **REST compression**: the heavy JSON routes (`/:id/snapshot`, `/:id/tool-buffers`, `/:id/summary-streams`) respond gzipped when the client accepts it, cutting connect/resync transfer ~90% for large sessions.
- **Client-side patch merge**: `RemoteSessionClient` applies `{kind:"full"}` / `{kind:"patch"}` envelopes by message id + index, keeps tolerating plain-array payloads (old server), and preserves the LocalAgentSession subscriber contract (subscribers still receive the full array).
- **Compatibility stance (accepted)**: server and client ship from the same build; envelope encoding is unconditional on the server. A transient old-client + new-server window (pre-restart dist) would misrender; the reverse direction stays safe via plain-array tolerance.
- **Transport cleanups**: tool output buffers switch from per-chunk string concatenation (O(n²)) to chunk arrays with lazy join; message timestamp revival runs only on full payloads; `[agent-diag]` console logging is gated behind a DEBUG flag; the client shell snapshot's usage shape is corrected.

Local sessions are not touched: the root cause (full-array channel payload) is healthy in-process, and all fixes stay in the server transport layer and remote client.

## Capabilities

### New Capabilities
- `remote-session-transport`: The HTTP/SSE plane between the agent server and remote session clients — event streaming contract (channels, delta mode, frame format), remount seed routes, and their performance/compat behavior.

### Modified Capabilities
<!-- None: no existing spec covers the /api/agent transport plane. -->

## Impact

- **Code**: `packages/server/src/routes/agent-session.ts` (delta encoding, coalescing, compression, buffer fix, log gating), `packages/server/src/messages-delta.ts` (new: envelope writer), `packages/server/src/remote-session-client.ts` (patch merge, revival scope, snapshot fix).
- **Compatibility**: envelope encoding is unconditional on the server (same-build deployment; old-client+new-server window accepted). Clients tolerate plain-array payloads (old server) and unknown `kind` values trigger a resync.
- **Performance**: streaming wire cost per text delta drops from O(session size) (~KB–MB) to O(changed message) (~bytes–KB); connect/resync transfers shrink ~10:1 with gzip.
- **No core changes**: `@my-agent/core`, local sessions, and the app-layer subscription contract are untouched.
