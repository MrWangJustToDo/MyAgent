## Context

### 现状：一套预定义组件词汇

- `ExtensionUI`（`packages/core/src/agent/extension/types.ts:241`）：`notify` / `subscribe` / `setStatus` / `getStatus` / `theme.fg`。`setStatus` 把状态塞进 core 的 `statusMap`（按 key），但 app 侧 `useExtensionUI` 把它折叠成**单个** `statusText`，被 `FooterContextBar` 仅在 `status === "idle"` 时显示 → 多扩展互相覆盖。
- `extension-ui` 通道 payload：`set-status` / `notify` / `set-widget` / `confirm`。
- App：`ExtensionWidget` 白名单只有 `progress-bar` / `label`（未知组件显示组件名）；`ExtensionConfirm` 是固定确认 UI；`theme.fg` 是恒等函数（无 ANSI）。

### 参考实现（claude-code-best statusLine，仅原理参考）

- 宿主**不解析内容**：用户 shell 命令的 stdout（`trim → 拆行 → 去空行 → join('\n')`）经 `<Ansi>` 原样渲染进 footer。
- stdin 收到一份极全的 JSON（model / workspace / cost / context_window / rate_limits / agent / worktree / vim）。
- 触发（event + settings 热重载 + `refreshInterval`）统一走 300ms debounce；单飞 `abort`；文本不变不更新；trust 网关。
- **它没有**「扩展提供布局/组件树」的模型 —— 所以布局原语树是本项目的自研部分，不是抄参考。

### Key Constraints

- 扩展在 **core** 运行，宿主可能是 **remote**（server / Chrome 扩展 / playground）。render payload **必须可 JSON 序列化**，不能下发函数/React 组件。
- 依赖方向：app 的 `hooks/*` 不得反向 import `components/*`；共享纯逻辑放 `utils/`。
- app 渲染刷新只走 `session.subscribe` 的 channel → `setState`（不引入 forceUpdate）。
- 新增/替换事件类型只改 `AgentEvents` 注册表 + 元数据（符合 `agent-event-bus` spec）。

## Goals / Non-Goals

### Goals
- 删除全部面向扩展的预定义业务组件，扩展通过**一个**通用渲染出口自由发挥。
- 既能输出任意 ANSI 文本（statusLine 同构），也能做基础排版（`text` / `row` / `column` / `box`）。
- 多扩展多槽互不覆盖；任意 agent 状态下可见；生命周期干净。
- 给扩展上下文快照以支持数据驱动渲染。

### Non-Goals
- 扩展下发/执行 React 组件或渲染函数（远端不可序列化）。
- 扩展交互协议（键位声明 / 按键回传）—— 因此 `confirm` 能力被删除。
- 全屏 `overlay` surface、payload 版本协商。

## Decisions

### Decision: 一个通用渲染出口，而不是继续维护组件词表
`ExtensionUI.render(surface, key, payload | null)`。删掉 `setStatus` / `set-widget` / `confirm` / `theme.fg`。
Rationale：词表永远不够，且每加一个都要改 app；statusLine 已经证明「宿主不解析 + 扩展自渲染」更自由。
Alternatives considered：保留 widget 白名单并扩表 —— 治标不治本，仍是预定义组件。

### Decision: payload = raw 文本 ∪ 通用布局原语树（封闭集合）
```ts
type ExtensionRenderPayload = string | ExtensionRenderNode;
type ExtensionRenderNode =
  | { type: "text"; value: string }                                  // value 可含 ANSI
  | { type: "row"; gap?: number; children: ExtensionRenderNode[] }
  | { type: "column"; gap?: number; children: ExtensionRenderNode[] }
  | { type: "box"; border?: boolean; padding?: number; children: ExtensionRenderNode[] };
```
Rationale：`string` 给最大自由（逃生舱）；四种原语只解决**布局/容器**，不含任何业务语义（没有 progress/label/table）。
Alternatives considered：只给 raw 文本（不能排版）；给任意 JSX/组件（不可序列化）。

### Decision: 样式走 ANSI，宿主不提供 styling 词汇
`text.value` 内联 ANSI（或布局树里也用带 ANSI 的文本）。宿主不引入 `color` / `dim` / `bold` 这类字段，避免又长出一套词表。需要便捷时另提供**独立的纯函数工具**（如 `ansi.fg(color, text)`）；它不进入 payload 词汇，也不属于「预定义组件」。
Alternatives considered：结构化 styling 字段 —— 更安全但更受限，且是新的预定义词汇。

### Decision: payload 必须可序列化且受限
发布时做一次**深度 JSON 探测**（`JSON.stringify` + replacer 拒绝 function / symbol / bigint，并捕获循环引用）：不可序列化的 payload **整体拒绝**、不写入 retained 槽，从而不会被 late-subscriber 重放或发往 remote 宿主；探测结果同时复用为 dedupe 指纹。对深度 / 节点数 / 文本长度设上限；越界即降级（忽略该节点），保证 remote 宿主与渲染成本可控。

### Decision: 同一 (surface, key) 跨扩展为「最后写者赢」
key 由扩展自己命名空间化；两个扩展撞同一个 (surface, key) 时后来的覆盖先前，归属也转给后写者（因此先前扩展被禁用不会清掉该槽）。spec 只承诺**不同 key 互不覆盖**。

### Decision: 保留 `notify`，删除 `confirm`
`notify` 是宿主原生通知（映射到输入反馈行），不是扩展渲染组件，保留。`confirm` 属于交互，删除；因为本变更不提供交互协议。
Alternatives considered：同时删 `notify`、或把 `confirm` 泛化成交互协议 —— 前者没必要，后者超出本变更范围。

### Decision: owner 清理与节流放在 core（发布侧）
core 掌握 owner 生命周期（enable/disable/destroy），一次实现所有宿主共享；app 只做渲染、去重与边界校验。

### Decision: 保留 `notify`，UI 出口固定为 render + context + notify
扩展的 UI 出口限定为三个：`render`（渲染）、`getContext`/`context`（上下文）、`notify`（宿主原生瞬时通知，非渲染组件）；`subscribe` 保留用于扩展间通信。`notify` 不删除 —— 删了扩展反而无法发瞬时提示。
Alternatives considered：连 `notify` 一起删 —— 没有收益，且丢失宿主原生通知能力。

### Decision: 保守过滤破坏性 ANSI
宿主**保留 SGR**（颜色/加粗/暗淡等样式）序列，**拦截破坏性序列**：清屏、光标移动/定位、窗口标题（OSC 0/2）、超链接（OSC 8）等。
Rationale：扩展能清屏会直接破坏整个 TUI；颜色才是「自由发挥」真正需要的部分。
Alternatives considered：完全不过滤（TUI 可被扩展破坏）；完全禁止 ANSI（丢失自由度的核心）。

### Decision: 只做 `footer` surface，surface 集合由宿主固定
本变更只要求 `footer`，不提供 `overlay`；扩展渲染到未知 surface 时静默忽略。未来新增 surface 需走 spec 变更。宿主把该 surface 放在 **footer 最底部**（状态栏之下），使其与宿主自身的状态行分离。
Rationale：最小闭环，避免 surface 集合退化成另一套需要长期维护的词表。
Alternatives considered：现在同时提供 `overlay` —— 过早抽象，需求未验证。

### Decision: payload 边界阈值与越界策略
- 最大嵌套深度：**≤ 8**
- 最大节点数：**≤ 200**（整棵树）
- 单节点文本长度：**≤ 2000** 字符

越界时**丢弃/截断越界部分并保留其余可渲染内容**（不整体丢弃，静默降级 —— app 渲染路径没有 logger，不为日志引入依赖）。阈值属实现常量，spec 只约束「必须受限且安全降级」。

### Decision: 内置 LSP 扩展按信号性质分流
服务器**生命周期**（starting / ready / failed / crashed）是瞬态事件，走 `ctx.ui.notify(text, level)`（宿主通知会自动清除）；仅 "N error(s) in file" 这类需要驻留的信息用 `ctx.ui.render("footer", "lsp", text)` 单行 raw 文本。它是 `packages/core` 内当前唯一真实消费者，不引入新的布局树用法。

## Risks / Trade-offs

- **[布局树词汇会再膨胀]** 「通用原语」有滑向「又一套组件」的惯性 → Mitigation: 在 spec 里定为**封闭集合**，新增原语必须走 spec 变更。
- **[危险 ANSI]** 扩展可输出清屏/光标跳转/OSC 8 等控制序列 → Mitigation: 文档约定 + 评估过滤（Open Question）。
- **[渲染炸弹]** 超深/超大布局树 → Mitigation: depth / node / length 上限 + 降级。
- **[能力回退]** 删除 `confirm` 后扩展无法向用户提问 → Mitigation: 明确记录为已知回退；如需要，另开「通用交互协议」提案。
- **[协议非兼容]** 旧事件被删且无兼容层 → Mitigation: 这是明确选择（放弃兼容）；发布说明中标注 BREAKING，全仓清理残留引用。
- **[remote 透传]** render payload 需跨 server/browser 传输 → Mitigation: 纯 JSON 约束（发布时深度探测，不可序列化即整体拒绝）+ 边界校验。

## Migration Plan

- **无兼容层**。受影响方：任何使用 `ctx.ui.setStatus` / `set-widget` / `confirm` / `theme.fg` 的扩展（当前仓库内唯一真实使用者是内置 LSP 扩展的 `ctx.ui.setStatus("lsp", …)`，见 `packages/core/src/agent/lsp/extension.ts`），需改写为 `render`。
- remote session：`extension-ui` 通道透传不解析 payload，替换事件类型无需协议版本协商（宿主与核心同版本发布）。
- Rollback：本变更只涉及源码与事件 union，回退即恢复旧事件/方法；无数据迁移。

## Open Questions

None — 先前列出的 6 个问题已全部收敛为上方的 Decisions。
