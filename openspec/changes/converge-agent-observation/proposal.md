## Why

A 档已修好 lifecycle emit 并文档化了 L1–L4，但 host 仍必须分别接线 `subscribeState`、`agentManager.on`、`AgentUIChannel`、全局 `subscribeStreamingCallback` 和 `AgentLog`。多 agent / 并行 tool 流时全局 streaming 表也容易串台。现在收敛观察面，并顺带把过胖的 `ManagedAgent` 拆成可维护的组合根。

## What Changes

- **`ManagedAgent.observe()` 门面**：一次订阅返回统一 unsubscribe；覆盖 L1 状态、选定的 L2 lifecycle 事件、L3 消息/流式输出（可选 log）。底层通道保留，不合并 AgentEventBus 与 ExtensionEventBus。
- **迁移 app 关键订阅点**：`use-agent-chat`、`use-agent-usage`、`use-task` / subagent hooks、`Footer`、streaming hooks 优先走 `observe`（或薄包装），减少漏订风险。
- **Streaming 作用域化**：将全局 `streamingCallbacks` Set 改为按 `agentId`（及既有 `toolCallId`）隔离；subscribe/emit 均要求 `agentId`，不再保留进程级 fan-in。
- **拆分 `ManagedAgent`**：按职责抽出 session persist / prepare-run / reactive-compact / extension wiring 等协作模块，组合根保持公开 API 稳定；目标单文件 ≤400 行（允许组合根略超若拆后更清晰）。
- **文档**：在 `ARCHITECTURE.md` §8 补充 `observe()` 用法；标明 raw 通道为高级/内部。
- **非目标**：不把 ExtensionEventBus 并入 observe；不改变 approval block/resume 归属；不做全量 EventEmitter 重写。

## Capabilities

### New Capabilities
- `agent-observe-facade`: Host-facing observation API (`observe` / handle) that wires L1–L3 subscriptions with a single teardown.
- `agent-streaming-scope`: Per-agent streaming callback registry replacing the process-global multicast table for tool stdout/stderr.

### Modified Capabilities
- `agent-lifecycle-events`: Hosts SHOULD prefer `observe()` for UI/telemetry wiring; document that raw multi-channel subscribe remains supported but is not the recommended host path.

## Impact

- **Core**: `managed-agent.ts`（拆分 + observe）、`streaming-callback.ts`、可能新增 `agent-observe.ts`；`index.ts` 导出；`ARCHITECTURE.md`。
- **App**: hooks/components 订阅迁移；行为应对外等价。
- **Validation**: 新/扩展 validate scripts（observe unsubscribe、streaming agent 隔离）。
- **Depends on**: 已归档的 `simplify-agent-events`（L1–L4 与 lifecycle 契约已落地）。
