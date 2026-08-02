## Why

`@my-agent/core` 的顶层分层（`agent/` 领域、`managers/` 编排、`models/` 适配）基本合理，但局部边界已经开始拖累可维护性：chat 与 detached 两套 finalize 路径、`agent/` 向上依赖 `managers/`、通用 stream 助手误放在 `subagent/`、`reactive-compact-retry` 名不副实且职责过载、公开 API 导出了仅内部使用的符号。现在做收敛，比继续叠加功能后再拆更便宜。

## What Changes

按优先级分波推进（关联项可并行；过时 API **不**保留兼容层）：

- **P0 — 行为与分层**
  - 统一 run 完成契约（chat pump 与 detached/`runManagedAgent*` 共用 finalize）
  - 抽中立共享类型，打断 `agent/` → `managers/` 倒置依赖
  - 将 `stream-errors` / `extract-assistant-text` 等通用助手移出 `subagent/`
- **P1 — 职责清晰**
  - 拆分并重命名 stream recovery（`run-stream-recovery` + 策略模块）
  - 理顺 prompt / cache 边界，禁止 `models` → `managers`
  - **BREAKING**：从 `@my-agent/core` 公开入口移除仅内部/validate 使用的符号（改走 `dev.ts` 或不导出）
- **P2 — 结构 / DX**
  - `manager-agent.ts` → `agent-manager.ts`（保留 `managed-agent.ts` 名）
  - `RunLifecycleHost` 改为 `Pick` / `import type`，去掉平行复制
  - **BREAKING**：分阶段收紧 `ManagedAgent` 公有可变字段（接线字段 private；可观察字段 readonly/getter）
  - 按需拆分超 400 行文件；明确 plan 领域 vs tools 落点规则
- **P3 — 可选清理**：barrel、状态类型微调、空壳 `types.ts`、轻微重复抽取等（按需，不阻塞主路径）
- 每波完成后跑通相关 `validate:*` / `pnpm build:core`（及按需新增 validate 脚本）；文档（`ARCHITECTURE.md` / `AGENTS.md`）同步更新

## Capabilities

### New Capabilities

- `agent-run-finalization`: 单一 run 完成/对账契约（chat 与 detached 共用）
- `core-module-boundaries`: 模块分层方向、通用代码归属、recovery/prompt 边界、命名约定
- `core-public-api`: `@my-agent/core` 公开导出范围与 `ManagedAgent` 可写表面约束

### Modified Capabilities

- （无）现有 `openspec/specs/` 能力不因本变更修改需求文本；本变更以新 capability 规格约束组织结构与运行时完成路径

## Impact

| Area | Change |
|------|--------|
| `packages/core` | managers/agent/models 重组、重命名、拆分；middleware / run 管道微调 |
| `@my-agent/core` public API | **BREAKING**：收紧导出；`ManagedAgent` 部分字段不可再直接赋值 |
| Hosts (`app`/`cli`/`extension`) | 仅当误用了将被移除的公开符号或可变字段时需改；预期改动面小 |
| Validate scripts | 更新 import 路径；按需新增（finalize、layering、public API） |
| Docs | `packages/core/ARCHITECTURE.md`、`AGENTS.md` |

## Non-Goals

- 推倒 `agent/` / `managers/` / `models/` 三分结构
- 重写 compaction / memory / plan 算法
- 合并 `AgentContext` 进 `ManagedAgent`
- 为过时公开符号保留长期 deprecate/shim 层（用户明确可不保留）
- 一次把 `ManagedAgent` 拆成 `RunnerState`/`ChatState` 对象树（仅做字段收紧）
