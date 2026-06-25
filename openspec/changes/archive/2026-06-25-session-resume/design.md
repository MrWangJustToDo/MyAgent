## Context

The agent maintains two message arrays in `AgentContext`:
- `messages` (ModelMessage[]): Full server-side conversation history
- `compactMessages` (ModelMessage[]): Working set sent to the LLM (post-compaction)

The CLI uses `DirectChatTransport` (in-process), while the extension uses HTTP transport to the `@my-agent/server` package. Both need session resume.

Currently, compaction saves transcripts to `.transcripts/` as JSONL — this will be replaced by the session store which tracks the same data plus metadata.

The Vercel AI SDK provides `convertToModelMessages(UIMessage[])` (UI→Model) but does NOT provide the inverse. We need a custom `convertModelMessagesToUIMessages()`.

## Goals / Non-Goals

**Goals:**
- Persist session state automatically after each agent interaction
- Resume any previous session, restoring both UI display and LLM context
- Single storage mechanism that works for CLI and extension
- Store model config so sessions can be resumed with the correct provider/model
- Support session listing, naming, and selection

**Non-Goals:**
- Multi-device sync or cloud storage (local file-based only)
- Resuming mid-stream (only resume after completed interactions)
- Storing API keys in session files (use env vars on resume)
- Backward compatibility with existing `.transcripts/` files

## Decisions

### 1. Storage Format: Single JSON file per session

Store each session as `.sessions/{id}.json` in the project root.

```
.sessions/
├── {session-id}.json
├── {session-id}.json
└── ...
```

Each file contains:
```ts
{
  id: string;
  name: string;
  provider: string;
  model: string;
  uiMessages: UIMessage[];         // converted from context.messages for client display
  compactMessages: ModelMessage[];  // for LLM context restoration
  usage: TokenUsage;
  todos: Todo[];
  createdAt: number;
  updatedAt: number;
}
```

**Rationale**: Single file is atomic (no partial writes), simple to list/delete, and JSON is easy to debug. Session files are small after compaction.

**Alternative considered**: JSONL streaming format — rejected because we need random access for listing metadata and atomic saves.

### 2. Save Trigger: On each `onFinish` + debounced on context change

- Primary save: In `createOnFinish()` callback in `Base.ts`, after each complete interaction
- Convert `context.messages` → `UIMessage[]` at save time
- Store `context.compactMessages` as-is

**Rationale**: `onFinish` is the natural point where messages are finalized. Saving after every interaction ensures no data loss.

### 3. ModelMessage → UIMessage Converter

Write a `convertModelMessagesToUIMessages()` utility that maps:
- `user` message → UIMessage with text/file parts
- `assistant` message → UIMessage with text/reasoning/tool-call parts
- `tool` message → merge tool-result into the preceding assistant message's tool-call parts (set state to `output-available`)

**Rationale**: The mapping is straightforward since we control all tool types. The community-written converters from the AI SDK issue (#7180) confirm this approach works.

### 4. Resume Flow

**CLI:**
- `--continue`: Load the most recent session for the current working directory
- `--resume [id|name]`: Load a specific session or show a picker
- Pass `uiMessages` as `initialMessages` to the `Chat` constructor
- Restore `compactMessages` into `AgentContext` before the first interaction

**Extension (via server):**
- `GET /api/sessions` — list available sessions
- `GET /api/sessions/:id` — load session (returns uiMessages + metadata)
- `POST /api/sessions/:id/resume` — server restores compactMessages into AgentContext
- Client receives uiMessages and passes them to `useChat` as initial messages

### 5. Session Identity

- ID: Generated UUID at session creation time
- Name: Auto-generated from first user message (first 50 chars), can be renamed
- Sessions are scoped to the project root path

### 6. No API Key Storage

Session stores `provider` and `model` name but NOT API keys. On resume, keys come from environment variables (same as fresh start). If the model/provider is unavailable, warn the user.

## Risks / Trade-offs

- **[Large session files]** → UIMessages with tool call details can grow large. Mitigation: compactMessages stays small (post-compaction), and UIMessages can be pruned to last N messages for display if needed in the future.
- **[Stale tool state on resume]** → Files may have changed on disk since last session. Mitigation: The LLM handles this naturally — it will re-read files as needed. The compacted summary provides enough context to continue.
- **[Concurrent writes]** → If two processes write the same session. Mitigation: Session ID is unique per agent instance. Not a realistic concern for single-user local tool.
- **[Schema evolution]** → Session file format may change. Mitigation: Include a `version` field in the schema for future migrations.
