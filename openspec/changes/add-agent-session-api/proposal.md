## Why

App 层仍通过 `ManagedAgent` / `AgentChatController` / `agentManager` / `TodoManager` 等对象直接读取与订阅，观察面虽有 `observe()`，但命令与状态碎片化。现有远程 CoreEnv 只覆盖工作区 I/O，agent 环无法以语言无关方式被非 TS 前端消费。需要统一的 Agent Session API：本地与 HTTP 同一形状，细粒度事件驱动更新，为 remote agent + 多语言 UI 打底。

## What Changes

- **引入 `AgentSession` 统一面**：单一入口提供 `getSnapshot` / `dispatch(command)` / `subscribe(channels)`；本地实现可继续持有并调用 `ManagedAgent`，但 **app 只通过 Session API 读写**。
- **内部先统一可订阅通知**：新增轻量 `Emitter`（或同名基类），接管 TodoManager / usage / status / queues / plan / UI messages 等「领域状态变更」的发事件与订阅；消灭「只有 todo 有 onChange、其它靠空 nudge + 读字段」的不一致。Agent 执行逻辑（run loop、tools、compaction）不改语义，只改通知出口。
- **外层仍按 Session 频道投影**：`LocalAgentSession` 从内部 Emitter（+ 过滤后的 lifecycle bus）fan-in 到 `state` / `messages` / `queues` / `usage` / `todos` / `plan` / `tool` / `summary` / `lifecycle`；HTTP 同形。
- **主 agent 与 subagent 共用同一套 Session**：每个 `ManagedAgent`（含 task subagent）对应一个 `AgentSession`；父快照只带子摘要，详情对子 id 开同一 Session。
- **可序列化快照**：`status`、`error`、`messages`（全量）、`queues`、`usage`、`todos`、`plan`、`autoApprove`、`subagents` 摘要等；**BREAKING**（对 app）：hooks 不再以 `ManagedAgent` 为主要依赖。
- **消息策略**：先保持 **全量 messages 快照**；留下增量/patch TODO。
- **非目标**：不合并 ExtensionEventBus；不重写 compaction/memory 语义；不把 CoreEnv 与 Agent plane 混成一个 HTTP 服务。

## Capabilities

### New Capabilities

- `agent-session-api`: 传输无关的 Agent Session 契约（snapshot、commands、subscribe）及 Local 实现；app 经此消费 agent
- `agent-internal-emitter`: 内部 TypedEmitter 基类与领域对象迁移（todos/usage/state/queues/plan/messages 等统一 `on`/`emit`）
- `agent-session-events`: 会话级细粒度事件频道；从内部 Emitter + lifecycle bus 投影及去重规则
- `agent-session-http`: 基于同一契约的 HTTP/SSE 服务端与客户端

### Modified Capabilities

- `agent-lifecycle-events`: 明确 hosts **SHALL** 经 Agent Session 订阅 UI 相关更新；域 Emitter / AgentEventBus 为内部路径，并文档化与 session 事件的关系

## Impact

| Area | Change |
|------|--------|
| `@my-agent/core` | Emitter 基类；Todo/Usage/status/queues/plan/UI 通知迁移；Session 类型 + LocalAgentSession fan-in；可选精简公开导出 |
| `@my-agent/app` | hooks/adapter 改为依赖 `AgentSession`；**BREAKING** 去掉对 ManagedAgent 的直接业务依赖 |
| `@my-agent/server` 或新 agent HTTP 入口 | Session HTTP/SSE 路由（可复用 Hono） |
| CLI / Extension | 创建 Local 或 Remote Session；CoreEnv remote 保持独立 |
| Docs | Emitter vs Session vs AgentEventBus；两平面（workspace vs agent） |
| Validates | emitter、session snapshot/command、事件频道、HTTP 契约 smoke |

## Non-Goals

- 消息增量/patch（仅 TODO）
- 把 Extension UI bus 并入 session
- 一次实现完整多租户鉴权（可留最小 session id；鉴权后续）
- 强制非 TS 前端示例完整产品化（契约与参考客户端优先）
