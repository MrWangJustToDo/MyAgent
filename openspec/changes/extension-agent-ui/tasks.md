## 1. Agent Server Transport

- [x] 1.1 Add HTTP server framework (Hono or native Node.js http) to `@my-agent/server` with CORS for `chrome-extension://` origins
- [x] 1.2 Implement `POST /api/chat` endpoint that creates/reuses an Agent instance and streams responses via `toUIMessageStreamResponse()`
- [x] 1.3 Implement `GET /api/health` endpoint returning server status, model name, and agent readiness
- [x] 1.4 Implement `POST /api/chat/stop` endpoint that aborts the current agent stream via AbortController
- [x] 1.5 Add agent lifecycle management (init on startup from `.env` config, create via `agentManager.createManagedAgent()`)
- [x] 1.6 Handle tool approval protocol over HTTP (approval responses sent in subsequent POST /api/chat requests per AI SDK protocol)
- [x] 1.7 Handle client disconnect detection and abort signal propagation

## 2. Extension Cleanup & Restructure

- [x] 2.1 Remove translation-specific code (content/App.tsx translate UI, service/api.ts, hooks/useOllamaStatus, hooks/useOllamaModal, hooks/useOllamaConfig, hooks/useTextSelect, hooks/useSyncConfig)
- [x] 2.2 Update `wxt.config.ts` to add side panel entrypoint and remove content script translate overlay
- [x] 2.3 Update `manifest.json` permissions for side panel API and localhost connections
- [x] 2.4 Update `package.json` dependencies — add `@ai-sdk/react`, `markstream-react`, `stream-markdown-parser`; remove unused translate deps

## 3. Extension Side Panel Chat UI

- [x] 3.1 Create side panel entrypoint (`entrypoints/sidepanel/`) with HTML + main.tsx + App.tsx shell
- [x] 3.2 Implement connection config state (server URL) using reactivity-store, persisted to chrome.storage
- [x] 3.3 Implement `useChat` integration with HTTP transport pointed at agent server URL
- [x] 3.4 Build MessageList component rendering user/assistant messages with role indicators
- [x] 3.5 Build markdown rendering component using `markstream-react` (same `stream-markdown-parser` as CLI, with streaming highlight support)
- [x] 3.6 Build ToolCallView component showing tool name, inputs (collapsible), status icon, and output
- [x] 3.7 Build ToolApprovalView component with Approve/Deny buttons for pending tool approvals
- [x] 3.8 Build ChatInput component with multiline support (Shift+Enter), send button, and image attachment
- [x] 3.9 Build streaming indicator (spinner/typing indicator while agent responds)
- [x] 3.10 Build TodoList component showing agent's active tasks with status badges

## 4. Extension Popup (Config)

- [x] 4.1 Rewrite popup/App.tsx as a config panel showing connection status + server URL input
- [x] 4.2 Add "Open Chat" button that opens the side panel via `chrome.sidePanel.open()`
- [x] 4.3 Show model name and provider info when connected (from `/api/health` response)

## 5. Integration & Polish

- [x] 5.1 Wire abort/stop: add "Stop" button in chat UI that calls `POST /api/chat/stop`
- [x] 5.2 Handle reconnection — auto-retry on disconnect, show reconnecting state
- [x] 5.3 Add error boundary and user-friendly error display for network/agent errors
- [x] 5.4 Style the chat UI with Tailwind CSS v4 + HeroUI components (dark/light mode)
- [x] 5.5 Update root `pnpm build` to include server build in correct order
- [x] 5.6 Verify typecheck passes for all packages (`pnpm typecheck`)
- [x] 5.7 Run lint and format (`pnpm lint && pnpm format`)
