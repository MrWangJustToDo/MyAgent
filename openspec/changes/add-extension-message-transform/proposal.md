## Why

扩展目前**拿不到模型消息链**。`ExtensionContext` 的 hook 面只有 `registerTool` / `registerCommand` / `registerInterceptor` / `registerContextProvider`（`packages/core/src/agent/extension/types.ts:395-403`），没有任何"改写发给模型的消息"的能力；全仓不存在 `registerMiddleware`。唯一 wire 邻近的 hook 是 `tool:after:<name>` → `payload.modifiedResult`（`packages/core/src/managers/middleware/extensions-middleware.ts:107-136`），且只覆盖工具结果。

这不是多模态专属问题，而是**扩展系统的能力缺口**。凡"在模型看到之前改写消息"的需求——图片转文字描述、敏感信息脱敏、消息裁剪、注入 wire 专用上下文、prompt 体积控制——今天一律无法实现。而 core 自己的 `MULTIMODAL_OMITTED_PLACEHOLDER` 通路（`models/adapter/capability-message-utils.ts:27`，由 `managers/run-stream-recovery.ts:183` 触发）会**静默吞掉媒体**，扩展无法在吞掉之前插手。

参照物 Pi 恰好有这条缝（`context` 事件：每次 LLM 调用前可非破坏性改写 messages），且 Pi 自己不做能力剥离——把剥离留给扩展。本仓是反过来的：有剥离、无缝。

## What Changes

- 新增扩展 API：`ctx.registerMessageTransformer(fn)`；一个扩展至多一个激活的 transformer，返回值可取消注册。
- transformer 在**每条 wire 构建路径**上运行：在 `getMessagesForLLM()` 之后、`messagesForModelCapabilities()` **之前**，故扩展看到的仍是**未被替换成占位符**的原始消息。
- transformer 的返回**只作用于本 run 的 wire**，绝不写回 UI channel / 会话存储（与既有的 wire-only recovery 惯例一致：`stream-recovery/max-tokens-continue.ts:61-65`）。
- transformer 按扩展加载顺序异步串行，输入是独立副本，异常被隔离成告警日志。
- **BREAKING（内部）**：消息链投影 cache 的 fingerprint 必须按"本轮是否装着 transformer"分区。空转时 fingerprint 不变、逐字节保持现有行为；装着扩展时不得复用缓存，否则扩展自己产生的转换结果会被当成本次调用的不动点缓存下来并跨调用泄漏。
- 文档更新：`packages/core/ARCHITECTURE.md` §8.5 扩展拦截章节（`:799-811`）与两处 pattern 列表（`:756`、`:801`）。

## Capabilities

### New Capabilities

- `extension-message-transform`: 扩展在模型 wire 前改写消息链的完整契约——注册与取消、三条调用点的位置与前序投影、wire-only 语义、串行顺序、失败隔离、脱敏边界（不改变长度），以及缓存分区不变式。

### Modified Capabilities

- `agent-event-bus`: 扩展 hook 名为冻结契约的条款需要说明 `ctx.registerMessageTransformer` 的地位——它是一个**刻意不走 `AgentEventBus`** 的扩展面（同步、读投影、不得写回），而不是第三个 dispatch mode。
- `agent-lifecycle-events`: "Architecture docs describe extension observation model" 要求 ARCHITECTURE.md 描述的扩展面必须包含 message transformer 及其与 bus 拦截的分工。

## Impact

**代码**

- `packages/core/src/agent/extension/types.ts` — 新 `MessageTransformer` 类型 + `ExtensionContext.registerMessageTransformer`
- `packages/core/src/agent/extension/runner.ts` — transformer 注册表、`collect`/`apply` 入口、disable 时清理
- `packages/core/src/managers/stream-recovery/capability-sanitize.ts` — 在 `messagesForModelCapabilities` 内、剥离之前调用
- `packages/core/src/managers/run-stream-recovery.ts` — 三条路径（`:183` 入口、`:101` reactive-compact 重试、`:123` transient 重试）都经由同一入口
- 投影 cache fingerprint（`agent/compaction/wire-projection-cache.ts:34-42` 的 policy key 或等价位置）
- `packages/core/src/dev/dev-managers.ts` — 为验证脚本导出新入口

**文档**

- `packages/core/ARCHITECTURE.md` §8.5 —— 新增 transformer 的调用位置、wire-only 契约、每调用一次、缓存绕行、失败隔离，并与两处 pattern 列表（`:756`、`:801`）明确分开（这两个列表**不加**新 entry）
- `AGENTS.md` 扩展章节 + Agent Event System 表格

**执行位置**

- transformer 在托管 `ManagedAgent` 的进程里运行：CLI 本地模式即 CLI 进程；`REMOTE_SESSION` 模式下在 **server** 侧（`remote-session-host.ts:54-71` 携 `extensionDirs` 建立远端 agent）。后果需写进文档：外部多模态端点的凭据属于 server 环境；扩展读到的路径是 server 的路径。
- Playground / WebContainer 无法从磁盘加载扩展模块（`loader.ts:170-172` 的动态 `import(file://...)`），因此该宿主不具备此能力——这是既有约束，文档不得作出承诺。

**既有缺陷（不在本变更范围）**

- `max-tokens-continue.ts:66-69` 拼上的 `CONTINUATION_PROMPT` 会被下一次 channel 投影覆盖（详见 design.md 的 Context 已确认事实第 1 条：代码级已确认，尚未运行时复现）。建议独立开单。

**兼容性**

- 无新依赖；不改 `AgentSession` channel 协议；不改 12 个 middleware 的 canonical order；不改既有 hook 名
- 子 agent 使用独立 runner，天然不继承父 agent 的 transformer（与 MCP / 扩展的既有隔离一致）
- 与 in-flight 的 `add-instruction-file-imports` 仅共享 `managed-agent.ts` / `agent-factory.ts` 文件、无逻辑耦合
