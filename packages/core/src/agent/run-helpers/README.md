# Run helpers

Chat / run-loop helpers used by `managers/` (`AgentChatController`, status, stream recovery).

This is **not** a general utils dump. Cross-cutting IDs / emitters live under `src/utils/`.
Tool-specific helpers stay in `agent/tools/util/`. Compaction helpers stay in `agent/compaction/`.

| Module | Role |
|--------|------|
| `tool-phase-utils` | When to continue the agent pump after tools |
| `pending-message-queue` | Steer / follow-up queue modes |
| `empty-model-stream` / `empty-assistant-shell` / `incomplete-tool-calls` | Post-stream repair / guards |
| `assert-async-iterable` | Stream contract checks |
| `capability-message-utils` | Multimodal wire sanitization |
| `suppress-replayed-tool-chunks` | UI channel tool-chunk dedupe |
| `apply-tool-denial-reason` | Denial reason on tool results |
| `estimate-image-tokens` | Token estimate for images |
