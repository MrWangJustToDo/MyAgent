## Context

The extension (`packages/extension/`) is currently a WXT-based browser extension that provides translation via Ollama. The CLI (`packages/cli/`) has a full agent chat UI built with React terminal components (ink), using `@ai-sdk/react`'s `useChat` hook connected via `DirectChatTransport` to the core `Agent` class.

The core `Agent` implements Vercel AI SDK's `Agent` interface with a `stream()` method. The CLI uses `DirectChatTransport` which calls `agent.stream()` directly in-process. Since the browser extension cannot run Node.js, we need a network boundary between the extension (browser) and the core agent (Node.js server).

The existing `@my-agent/server` package is a minimal MCP server — it can be extended or a new transport server can co-locate there.

## Goals / Non-Goals

**Goals:**
- Provide a browser-based agent chat UI with feature parity to the CLI (messages, streaming, tool approval, todo list, markdown rendering)
- Use Vercel AI SDK's `useChat` hook in the extension with a network-based `ChatTransport`
- Expose core Agent over HTTP/WebSocket so the extension connects to `localhost:<port>`
- Reuse the same `@my-agent/core` Agent setup (tools, compaction, skills, MCP)
- Keep the WXT + HeroUI + Tailwind CSS v4 stack for the extension UI

**Non-Goals:**
- Remote/cloud deployment of the agent server (localhost only for now)
- Authentication or multi-user support
- Mobile browser support
- Keeping any translation functionality (full replacement)
- DevTools panel (can be added later)

## Decisions

### 1. Transport: HTTP streaming with Vercel AI SDK protocol

**Decision**: Use Vercel AI SDK's built-in HTTP streaming protocol. The server exposes a POST endpoint that accepts messages and returns a `UIMessageStream`. The extension uses `useChat` with a URL-based transport (`fetch` to `http://localhost:<port>/api/chat`).

**Rationale**: Vercel AI SDK's `useChat` already supports HTTP transport out of the box (the default). This requires no custom WebSocket protocol — just a standard Next.js-style API route. The server wraps `DirectChatTransport` internally and streams responses over HTTP using `toUIMessageStreamResponse()`.

**Alternatives considered**:
- WebSocket transport: More complex, bidirectional not needed for request/response chat
- Custom JSON-RPC: Reinvents what AI SDK already provides
- Chrome Native Messaging: Requires a native host binary, overly complex

### 2. Server location: Extend `@my-agent/server` package

**Decision**: Add the agent transport server to the existing `@my-agent/server` package. It will run alongside (or replace) the MCP server, exposing `/api/chat` for the extension.

**Rationale**: Keeps the monorepo clean — one server package. The MCP server functionality can coexist. Users start the server once and both CLI and extension can connect.

### 3. Extension UI architecture: Side panel for main chat, popup for config

**Decision**: Use Chrome's Side Panel API for the main chat interface (full-height, persistent). The popup remains for quick config (server URL, connection status). Content script is removed (no more in-page translate overlay).

**Rationale**: Side panel provides enough space for a proper chat UI. Popup is too small for conversation. Content script overlay is no longer needed.

### 4. State management: `@ai-sdk/react` useChat + reactivity-store

**Decision**: Use `useChat` from `@ai-sdk/react` for message state (like CLI does), and `reactivity-store` for local UI state (config, connection status).

**Rationale**: Mirrors the CLI architecture. `useChat` handles the complex streaming/message/approval state. `reactivity-store` handles extension-specific state.

### 5. Markdown rendering: `markstream-react` with `stream-markdown-parser`

**Decision**: Use `markstream-react` for the extension's markdown rendering. It's built on the same `stream-markdown-parser` that the CLI already uses, but renders to HTML (browser) instead of terminal strings. It supports streaming rendering, code highlighting (via `stream-monaco` optional peer dep), mermaid diagrams, and diff code blocks out of the box.

**Rationale**: Same AST parser (`stream-markdown-parser`) as the CLI ensures consistent markdown parsing behavior. `markstream-react` is purpose-built for AI chat interfaces with streaming support. Avoids shiki (terminal-focused) and avoids reinventing a markdown renderer. Ships with its own CSS (including a Tailwind-compatible variant).

## Risks / Trade-offs

- **[Server must be running]** → Extension shows clear connection status; popup guides user to start the server. Future: auto-start via native messaging.
- **[Localhost only]** → Acceptable for V1. CORS configured for `chrome-extension://` origin.
- **[No tool output streaming for long operations]** → HTTP streaming handles this via the AI SDK protocol's chunked responses.
- **[Side Panel API browser support]** → Chrome 114+. Firefox doesn't support it — Firefox version would need a different approach (sidebar or tab).
- **[Large bundle size]** → Tree-shake AI SDK, lazy-load markdown renderer. Monitor with WXT's built-in analysis.
