# Change: Redesign extension UI around a generic render surface

## Why

现有的扩展 UI 是一套**预定义组件词汇**：`setStatus(key,text)`（被 app 折叠成单个 `statusText`，多扩展互相覆盖、只在 `idle` 可见）、`set-widget` 的 `progress-bar` / `label` 白名单 renderer、`confirm`、恒等的 `theme.fg`。扩展被锁死在宿主的词表里，既不能排版也不能自由输出。

对标参考（Claude Code 的 statusLine，仅原理参考）证明了另一条路：**宿主不解析内容，只负责把 `stdout` 的 ANSI 文本放进去**，自由度来自「纯文本进出 + 扩展自己渲染」。本项目的扩展是进程内 JS，因此做同样的事需要两个要素：一个**通用渲染出口**，以及一份**上下文快照**。

本变更**主动放弃向后兼容**：删掉全部面向扩展的预定义 UI 组件，只留一个通用渲染出口。

## What Changes

- **BREAKING — 删除预定义组件**：移除 `ExtensionUI.setStatus` / `getStatus` / `theme.fg`；移除 `set-widget` / `confirm` 两个事件类型；移除 app 侧 `ExtensionWidget`（白名单 `progress-bar` / `label`）、`ExtensionConfirm`、以及 `useExtensionUI` 里的 `statusText` / `widgets` / `confirm` 投影。
- **新增通用渲染出口** `ExtensionUI.render(surface, key, payload | null)`：把 render payload 发布到宿主的扩展渲染面；按 `key` 多槽共存、重发替换、`null`/空值移除、owner 归属清理。
- **payload 两种形态**：
  - **raw 文本**：`string`，可含 ANSI、可多行，宿主**原样**渲染（statusLine 同构）。
  - **通用布局原语树**：`text` / `row` / `column` / `box` 四种原语的**封闭集合**，由宿主**单一通用 renderer** 渲染；不引入任何业务组件。
- **新增上下文快照**：`ctx.ui.getContext()` 同步返回当前快照 + `context` 通知推送（model / status / usage / workspace / sessionName / mode），让扩展数据驱动地渲染。
- **协议**：`extension-ui` 通道新增 `render` 事件（携带 `surface` / `key` / `payload`），替代被删的 `set-status` / `set-widget` / `confirm`。
- **保留**：`notify(message, level)`（宿主原生通知，不是渲染组件）、`subscribe`（扩展间通信）、宿主自带的 `ExtensionPanel`（扩展列表/开关管理 UI，属于宿主功能而非扩展渲染组件）。
- **无迁移/兼容**：不提供旧事件与旧方法的兼容层；受影响的扩展直接改写。

## Capabilities

### New Capabilities

- `extension-ui`: 通用扩展渲染面 —— surface + keyed 槽、raw 文本与布局原语树两种 payload、宿主单一通用 renderer、payload 边界、上下文快照，以及明确「不向扩展暴露任何预定义业务组件」的约束。

### Modified Capabilities

- *(none)* `agent-event-bus` 的 spec 只描述总线机制（统一注册表 / 派发模式 / retained 值），替换事件类型按其「单一注册表」约定登记即可，无需 spec 变更。

## Impact

- **BREAKING**：`set-status` / `set-widget` / `confirm` 三个事件类型与 `ExtensionUI.setStatus` / `getStatus` / `theme.fg` 被移除，且不提供兼容层。
- Affected specs: `extension-ui`（新增）
- Affected code:
  - **Core**: `packages/core/src/agent/extension/types.ts`（`ExtensionUI` 重写：去掉 `setStatus`/`getStatus`/`theme.fg`，加 `render` / `getContext`）、`packages/core/src/agent/extension/runner.ts`（`DefaultExtensionUI` 重写、owner 清理）、`packages/core/src/agent/agent-event-bus/types.ts`、`packages/core/src/agent-session/types.ts`（事件 union 替换为 `render`）、`packages/core/src/agent-session/local-agent-session.ts`（render 槽重放）
  - **App**: `packages/app/src/hooks/use-extension-ui.ts`（store 改为 `surfaces: Record<surface, Record<key, payload>>`）、新增 `packages/app/src/components/ExtensionRenderSurface.tsx`（通用 renderer）、`packages/app/src/layout/Footer.tsx`（挂载 surface）；**删除** `packages/app/src/components/ExtensionWidget.tsx`、`packages/app/src/components/ExtensionConfirm.tsx` 及其在 `packages/app/src/app/Agent.tsx` 的挂载
  - **Docs**: `packages/core/ARCHITECTURE.md`（extension UI 章节）、`AGENTS.md`
- **Non-goals**：扩展下发/执行 React 组件（远端不可序列化）；扩展交互协议（因此 `confirm` 能力被删除，如后续需要另开提案）；`overlay`（全屏）surface；多宿主间的 payload 版本协商。

## Open Questions

见 `design.md`。（是否也删除 `notify`、是否提供 styling 便捷字段、危险 ANSI 过滤、overlay surface、布局树边界阈值。）
