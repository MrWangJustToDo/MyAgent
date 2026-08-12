## Why

The browser extension currently only serves as a translation tool (select text → translate via Ollama). The core agent capabilities (file ops, web ops, tool execution, agentic loop, streaming) are entirely unused in the extension. By transforming the extension into an agent UI — mirroring the CLI's chat interface — users get a browser-based AI coding assistant that connects to the same core logic via transport, enabling agent interactions from the browser without a terminal.

## What Changes

- **Replace** the translate-focused popup/content UI with an agent chat interface (message list, input, tool approval, streaming)
- **Add** a chat transport layer in the extension that connects to `@my-agent/core` via a local server (HTTP/WebSocket transport) since the browser cannot run Node.js directly
- **Add** a lightweight server (or extend the existing `@my-agent/server` package) to expose the core Agent over a network transport compatible with Vercel AI SDK's `ChatTransport` protocol
- **Remove** the translation-specific code (translate API, language detection, Ollama model picker for translate)
- **Add** extension UI components: message list, markdown rendering, tool call visualization, tool approval flow, todo list, streaming indicators
- **Retain** the WXT + HeroUI + Tailwind CSS v4 stack for the extension UI framework

## Capabilities

### New Capabilities
- `extension-chat-ui`: Browser-based agent chat interface with message rendering, streaming, tool approval, and input handling
- `agent-server-transport`: Network transport layer (HTTP/WebSocket) that exposes core Agent to remote clients (extension, future web UI)

### Modified Capabilities

## Impact

- **`packages/extension/`**: Major rewrite — popup becomes agent config/connect, content script or side panel becomes the chat UI
- **`packages/server/`** (or new transport package): Extended to serve as the agent transport bridge between browser extension and core
- **`packages/core/`**: No changes to core logic; only consumed via existing public API (`agentManager`, `DirectChatTransport`, `Agent`)
- **Dependencies**: May add `@ai-sdk/react` to extension for `useChat` hook, WebSocket client library
- **Browser permissions**: May need `sidePanel` permission, WebSocket/fetch to localhost
