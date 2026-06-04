# 🚀 MyAgent

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-18%2B-339933?logo=node.js)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-9%2B-F69220?logo=pnpm)](https://pnpm.io)
[![Vercel AI SDK](https://img.shields.io/badge/Vercel%20AI%20SDK-6.0-000000?logo=vercel)](https://sdk.vercel.ai/docs)

An open-source AI coding agent built on [Vercel AI SDK](https://sdk.vercel.ai/docs) with a React-powered terminal UI.

---

## ✨ Features

| Category | Description |
|----------|-------------|
| **Multi-Model** | OpenAI, Ollama, DeepSeek, OpenRouter — any LLM provider |
| **Terminal UI** | React-powered with Shiki syntax highlighting, diff views, streaming markdown |
| **Tool Approval** | Review + approve/deny tool calls with custom deny reasons |
| **Ask User** | Agent asks questions with selectable options or freeform answers |
| **Subagents** | Context-isolated tasks with read-only tools and 30-step limit |
| **Skills** | On-demand domain knowledge injection (list → load) |
| **Context Compaction** | 3-layer compression for infinite conversations |
| **Session Persistence** | Save/resume conversations to disk |
| **Sandbox** | Isolated command execution (local / native / remote) |
| **Web** | DuckDuckGo search + page fetch |
| **MCP** | Connect to MCP servers for extra tools |
| **Notifications** | Real-time agent notifications with cycling display |
| **Memory** | Automatic extraction and consolidation |

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────┐
│              @my-agent/core               │
│  (Agent, Tools, LLM, Sessions, MCP...)   │
└──────┬──────────┬──────────┬──────────────┘
       │          │          │
  ┌────┴───┐  ┌──┴────┐  ┌─┴──────────┐
  │   CLI  │  │ Server│  │  Extension  │
  └────────┘  └───────┘  └────────────┘
```

| Package | Description |
|---------|-------------|
| `@my-agent/core` | Agent loop, 22 tools, LLM integration, sandbox, sessions, MCP, memory, skills, logging |
| `@my-agent/cli` | Terminal CLI using [@my-react/react-terminal](https://github.com/MrWangJustToDo/MyReact) |
| `@my-agent/server` | HTTP server (Hono) for extension and API clients |
| `@my-agent/extension` | Chrome/Edge extension (WXT + HeroUI) |
| `@my-agent/mcp-server` | MCP server with screenshot tool |

---

## 📸 Screenshots

### 🖥️ Tool Flow
![Tool Flow](toolflow.png)

### ✏️ Edit with Diff View
![Edit Diff View](editdiff.png)

### 📝 Markdown Rendering
![Markdown Rendering](markdown.png)

### 🧠 Subagent
![Subagent](subagent.png)

### 🐛 Devtools Debug
Built with [myreact-devtools](https://github.com/MrWangJustToDo/myreact-devtools) powered by [@my-react framework](https://github.com/MrWangJustToDo/MyReact)

![Devtools Debug 1](devtools-debug-1.png)
![Devtools Debug 2](devtools-debug-2.png)

### 🌍 Browser Extension
![Extension](extension.png)

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+, pnpm 9+

```bash
git clone https://github.com/MrWangJustToDo/MyAgent.git
cd MyAgent
pnpm install
pnpm build
```

### Configuration

Create `.env` in the root:

```bash
PROVIDER=ollama            # ollama | openai | deepseek | openRouter
MODEL=qwen3:8b
API_URL=http://localhost:11434
API_KEY=sk-xxx             # Required for non-Ollama providers
SANDBOX_ENV=local          # local | native | remote
MAX_ITERATIONS=50
```

### Running

```bash
pnpm start:cli             # Terminal CLI
pnpm dev:server            # HTTP server
pnpm dev:extension         # Browser extension
pnpm dev:mcp-server        # MCP server
```

---

## 🛠️ Tools

| Category | Tools |
|----------|-------|
| **File** | `read_file`, `write_file`, `edit_file`, `search_replace`, `copy_file`, `move_file`, `delete_file`, `glob`, `grep`, `tree`, `list_file` |
| **System** | `run_command` |
| **Web** | `websearch` (DuckDuckGo), `webfetch` (page fetch) |
| **Agent** | `task` (subagents), `ask_user` (questions with multi-select), `todo` (task lists), `list_skills`, `load_skill` |

---

## ⌨️ CLI Keyboard Shortcuts

The CLI has **4 modes** — shortcuts adapt to the current mode:

| Key | Normal | Approval | Select (Ask User) | Freeform |
|-----|--------|----------|-------------------|----------|
| `Enter` | Submit | Submit command | Confirm selection | Submit |
| `Esc` | Dismiss autocomplete / Abort run | Cancel deny reason | Close list | Go back |
| `y` / `n` | — | Approve / Deny | — | — |
| `↑` `↓` | History / Autocomplete | Autocomplete nav | Navigate options | — |
| `Space` | — | — | Toggle (multi-select) | — |
| `Tab` | Accept autocomplete | Accept autocomplete | — | — |
| `Ctrl+C` | Exit | Exit | Exit | Exit |

Slash commands (`/help`, `/rename`, `/resume`) available in Normal and Approval modes.

---

## 🔧 Development

```bash
pnpm dev          # Watch mode
pnpm typecheck    # TypeScript check
pnpm lint         # ESLint
pnpm format       # Prettier
pnpm build        # Production build
pnpm clean        # Remove artifacts
```

---

## 📄 License

MIT © [MrWangJustToDo](https://github.com/MrWangJustToDo)

Built with [@my-react framework](https://github.com/MrWangJustToDo/MyReact), [Vercel AI SDK](https://sdk.vercel.ai/docs), and [Ollama](https://ollama.ai)
