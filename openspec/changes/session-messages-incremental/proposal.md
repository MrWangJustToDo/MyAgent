## Why

长会话多轮迭代下，每次 `onConfig`（每次 LLM 调用前）都会把整条 UI 历史重新投影为 model wire messages（`convertMessagesToModelMessages` + `getModelVisibleMessages`），成本是 O(history × tool-rounds)。即使一轮内只有最后一条 assistant 消息变化，其余历史仍被全量重复转换。

## What Changes

- 在 compaction middleware 的 UI→wire 投影处增加缓存：按 channel revision + 消息数 + 末条消息 id/len + policy key 生成指纹；指纹未变时复用上一轮 `ModelMessage[]` 数组引用，跳过全量 convert/project。
- 缓存随 channel revision 自动失效；compaction 真压缩后显式 `invalidate()`。
- **非 BREAKING**：行为等价，仅省去重复投影；不改变远程 SSE 契约，不改变 `messages` 通道投递（仍为全量 `UIMessage[]`）。
- 新增 validate：wire 缓存命中时不重复全量 convert、追加/压缩后正确失效。

## Capabilities

### New Capabilities

- `wire-projection-cache`: 进模型前 UI→wire 投影的缓存与增量更新，避免每轮 `onConfig` 全量重算。

## Impact

- `packages/core/src/agent/ui-channel.ts` — 单调递增 `revision` 计数
- `packages/core/src/agent/compaction/wire-projection-cache.ts` — 新缓存 + 指纹
- `packages/core/src/managers/middleware/compaction-middleware.ts` — `onConfig` 走缓存，compact 后失效
- 文档：`ARCHITECTURE.md` 补充投影缓存说明
