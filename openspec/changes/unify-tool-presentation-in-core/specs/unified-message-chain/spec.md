# unified-message-chain Specification (delta)

## ADDED Requirements

### Requirement: Tool-call parts carry a core-computed display payload

The durable UI message chain SHALL carry a host-facing display payload on tool-call parts, written by core when the tool call completes.

#### Scenario: Written once, at completion

- **WHEN** a server tool finishes (success, error, or denial)
- **THEN** core attaches the display payload to that tool-call part in the UI channel before/with the result

#### Scenario: Persisted with the chain

- **WHEN** the message chain is persisted and later restored
- **THEN** the payload is restored as written; hosts do not recompute historical rows

#### Scenario: Absent for older chains

- **WHEN** a restored chain has tool-call parts without a payload
- **THEN** hosts render them from the tool presentation catalog without error (no backfill or recomputation is performed)

#### Scenario: Excluded from the model wire

- **WHEN** the chain is projected to model messages
- **THEN** the display payload is not forwarded
