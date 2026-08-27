## 1. SSE delta encoding (server)

- [x] 1.1 Wire the delta writer into `GET /:id/events`: encode every `messages` event as an envelope, pass other channels through untouched
- [x] 1.2 Implement reference-equality diff (baseline `Map<id, messageRef>` + order) producing `{kind:"patch", upserted:[{index,message}], removed:[ids]}` vs `{kind:"full", messages}` envelopes
- [x] 1.3 Safety nets: full on missing baseline, >50% changed, every 1000 events or 10 s since last full
- [x] 1.4 Coalesce patches per connection on a 60 ms trailing edge; flush fulls immediately and discard pending patches

## 2. Client merge (server package client)

- [x] 2.1 Extend the messages branch: `kind:"patch"` splice merge (removed → upserted by index), `kind:"full"` replace + revive timestamps, no `kind` → legacy full (old-server tolerance)
- [x] 2.2 Unknown `kind` triggers `resync()`; subscriber callbacks still receive the full merged array (LocalAgentSession contract)
- [x] 2.3 Fix shell `emptySnapshot` usage to `UsageChangeSnapshot` shape

## 3. Compression + cleanups (server)

- [x] 3.1 Apply gzip compression to `/:id/snapshot`, `/:id/tool-buffers`, `/:id/summary-streams` when accepted; never on `/events`
- [x] 3.2 Rework tool buffers to chunk arrays with byte cap and lazy join (same 256 KB semantics)
- [x] 3.3 Gate `[agent-diag]` logging behind `AGENT_SESSION_DEBUG=1`

## 4. Validation

- [x] 4.1 Round-trip script: envelope stream emits full → patch → safety-net full; patch merge reconstructs the exact array; plain-array payloads (old server) and unknown kinds behave per spec
- [x] 4.2 Live smoke: extend `validate:agent-session-http` — remote client subscribes, snapshot/messages stay consistent through envelope encoding; gzip on seed routes
- [x] 4.3 `pnpm build:server`, `pnpm build:app`, typecheck for server/app/cli; lint + prettier on changed files
