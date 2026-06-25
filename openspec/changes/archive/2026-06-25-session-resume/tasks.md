## 1. Session Types & Schema

- [x] 1.1 Create `packages/core/src/agent/session/types.ts` with SessionData interface (id, name, version, provider, model, uiMessages, compactMessages, usage, todos, createdAt, updatedAt) and Zod schema
- [x] 1.2 Create `packages/core/src/agent/session/index.ts` with exports

## 2. ModelMessage to UIMessage Converter

- [x] 2.1 Create `packages/core/src/agent/session/convert-messages.ts` with `convertModelMessagesToUIMessages()` function that handles user (text/file), assistant (text/reasoning/tool-call), and tool (merge results) messages
- [x] 2.2 Handle edge cases: system messages (skip), empty content, tool-result merging into preceding assistant, generating stable IDs

## 3. Session Store

- [x] 3.1 Create `packages/core/src/agent/session/session-store.ts` with `SessionStore` class providing save(), load(), list(), delete(), getLatest() methods using the sandbox filesystem
- [x] 3.2 Implement file-based storage in `.sessions/{id}.json` with atomic writes
- [x] 3.3 Implement list() that reads metadata without loading full message arrays (read file, parse, return subset)

## 4. Session Integration with Agent

- [x] 4.1 Add `SessionStore` instance to `Base.ts` (set via `setSessionStore()`)
- [x] 4.2 Create session on agent start in `AgentManager.createManagedAgent()` — generate ID, set initial name
- [x] 4.3 Auto-save session in `createOnFinish()` callback: convert context.messages → UIMessages, save with compactMessages, usage, todos
- [x] 4.4 Update session name from first user message (in prepareStep or onFinish when name is still default)

## 5. Resume Logic in Core

- [x] 5.1 Add `resumeSession(sessionId)` method to `AgentManager` that loads session, restores compactMessages into AgentContext, restores usage into AgentContext, restores todos into TodoManager
- [x] 5.2 Add `continueLatestSession()` method that calls getLatest() then resumeSession()
- [x] 5.3 Return the loaded uiMessages from resume methods so callers (CLI/extension) can pass them to the client

## 6. CLI Integration

- [x] 6.1 Add `--continue` and `--resume [id|name]` CLI flags to `use-args.ts`
- [x] 6.2 In `create.ts`, if `--continue` or `--resume` is set, call the corresponding AgentManager method and pass returned uiMessages as `initialMessages` to the Chat constructor
- [x] 6.3 Add session list display when `--resume` is used without an argument (show recent sessions for user to pick)

## 7. Extension/Server Integration

- [x] 7.1 Add `GET /api/sessions` endpoint to server that returns session list (metadata only)
- [x] 7.2 Add `GET /api/sessions/:id` endpoint that returns full session data (uiMessages for client)
- [x] 7.3 Add `POST /api/sessions/:id/resume` endpoint that restores compactMessages into agent and returns uiMessages
- [x] 7.4 Update extension UI to show session picker and support resume flow

## 8. Export & Cleanup

- [x] 8.1 Export session types and functions from `packages/core/src/agent/index.ts`
- [x] 8.2 Run lint, format, typecheck, and build to verify
