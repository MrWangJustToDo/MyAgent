# Tasks

> 本提案先只产出文档；以下为实现清单。因为放弃兼容，任务包含大量「删除」步骤。

## 1. Core — 通用渲染出口

- [x] 1.1 定义 `ExtensionRenderNode`（`text` / `row` / `column` / `box` 封闭集合）与 `ExtensionRenderPayload = string | ExtensionRenderNode`
- [x] 1.2 `ExtensionUI` 重写：`render(surface, key, payload | null)`、`getContext()`、保留 `notify` / `subscribe`；删除 `setStatus` / `getStatus` / `theme.fg`
- [x] 1.3 `DefaultExtensionUI` 重写：维护 `surfaces: Map<surface, Map<key, payload>>`，`notify("render", { surface, key, payload })`
- [x] 1.4 owner 归属与清理：`render` 经 `wrapUi(ownerId)` 绑定，`destroyExtension` / `setEnabled(false)` 时清掉该 owner 的全部槽
- [x] 1.5 `extension:ui` 事件 union 替换：去掉 `set-status` / `set-widget` / `confirm`，新增 `{ type: "render"; surface; key; payload }`（`agent-event-bus/types.ts` 与 `agent-session/types.ts` 两处同步）
- [x] 1.6 会话订阅时重放当前 render 槽（对齐现有 status 重放逻辑）

## 2. App — 通用 renderer 与挂载

- [x] 2.1 `useExtensionUI`：状态改为 `surfaces: Record<string, Record<string, ExtensionRenderPayload>>`；删除 `statusText` / `widgets` / `confirm`
- [x] 2.2 新增 `packages/app/src/components/ExtensionRenderSurface.tsx`：单一通用 renderer，递归渲染 `text` / `row` / `column` / `box`，raw 字符串走原样文本分支
- [x] 2.3 在 `packages/app/src/layout/Footer.tsx` 挂载 `footer` surface（thinking line 上方），任意 agent 状态下可见
- [x] 2.4 验证 ink `<Text>` 对字符串内联 ANSI 的渲染（如需，评估显式 ANSI 组件/解析）

## 3. 边界、节流与生命周期

- [x] 3.1 节流（约 100ms）+ 同 payload 去重，避免流式期间高频重渲
- [x] 3.2 payload 边界：最大深度、最大节点数、最大文本长度；超出部分静默忽略（保留其余内容）
- [x] 3.3 未知 `surface` / 未知 `node.type` 的安全降级（忽略该节点/不渲染，不显示类型名，不影响其余内容）
- [x] 3.4 失败静默：发布异常不影响 host UI 与 agent loop

## 4. 上下文快照

- [x] 4.1 定义 `ExtensionUiContext`（model / status / usage / workspace / sessionName / mode）
- [x] 4.2 `ctx.ui.getContext()` 同步返回当前快照
- [x] 4.3 相关状态变化时（status / usage / model / workspace）节流推送 `context` 通知

## 5. 删除预定义组件（BREAKING）

- [x] 5.1 删除 `packages/app/src/components/ExtensionWidget.tsx`
- [x] 5.2 删除 `packages/app/src/components/ExtensionConfirm.tsx`
- [x] 5.3 在 `packages/app/src/app/Agent.tsx` 移除 `<ExtensionWidget>` / `<ExtensionConfirm>` 挂载与 `confirm` / `widgets` 选择
- [x] 5.4 移除 `useExtensionUI` 中被删字段的引用点（含 `FooterContextBar` 的 `extStatus`）
- [x] 5.5 清理 core 侧 `setStatusWithOwner` / `clearStatusByOwner` / `statusMap` 等不再需要的状态实现
- [x] 5.6 全仓搜索并清理对 `set-status` / `set-widget` / `confirm` / `theme.fg` 的残留引用

## 6. 文档与验证

- [x] 6.1 更新 `packages/core/ARCHITECTURE.md` extension UI 章节（render surface / payload / 上下文 / 已移除项）
- [x] 6.2 更新 `AGENTS.md` 扩展相关约定
- [x] 6.3 `openspec validate redesign-extension-ui --strict`
- [x] 6.4 构建与静态检查：`pnpm build:core && pnpm build:app`，对改动文件跑 prettier / eslint
