## ADDED Requirements

### Requirement: Cache UI-to-wire projection across onConfig
When preparing model-visible (wire) messages from the UI channel for an LLM call, the system MUST reuse the previous projected wire array when the channel content fingerprint is unchanged since the last successful projection for that agent.

#### Scenario: Cache hit skips full convert
- **WHEN** `onConfig` runs again and no UI channel message was added, removed, or replaced since the last projection
- **THEN** the middleware supplies the same wire messages array reference (or an equal cached copy) without re-converting the full history

#### Scenario: Cache miss after append
- **WHEN** a new assistant or tool message is appended to the UI channel
- **THEN** the next projection recomputes wire messages and updates the cache fingerprint

### Requirement: Invalidate projection cache on structural resets
The system MUST invalidate the wire projection cache when the conversation is cleared, restored from disk, or compacted (summary appended / history cut).

#### Scenario: Compact invalidates cache
- **WHEN** compaction successfully appends a summary checkpoint to the UI channel
- **THEN** the next LLM projection does not reuse the pre-compact cached wire array
