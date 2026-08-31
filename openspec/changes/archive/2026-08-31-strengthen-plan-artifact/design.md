## Context

plan 产物机制目前有两个短板（对比 Claude Plan Agent / Grok workflows）：

1. **`key_files` 可选**（`create-plan-tool.ts:24` `z.array(z.string()).optional()`）——plan 常常不带文件定位，executing 阶段 agent 需重新探索才知道动哪些文件。Claude Plan Agent 强制以 "Critical Files" 收尾，这正是 plan 能直接驱动 execute 的核心。
2. **Verification 只在执行后一次性提交**——`complete_plan` 要求 `verificationResults[]`，但执行中途没有任何逐项跟踪；验证与执行脱节。

现状代码：plan 域集中在 `packages/core/src/agent/plan/`，已有 `parseVerificationItemsFromText`（`plan-verification.ts:31`）可把 verification 文本解析为条目；TodoManager 提供 `update()`/`getItems()`/`getTitle()`，TodoItem 仅含 content/status/priority（无 evidence 字段）。`applyPlanArtifact`（`plan-mode-controller.ts:313`）统一 seed steps 为 plan todos。

## Goals / Non-Goals

**Goals:**
- `create_plan`/`update_plan` 强制携带 `key_files`（非空），planning prompt 引导 3-5 个，executing prompt 强调先读
- plan 应用时把 Verification checklist 项 seed 为 plan todos（与 steps 并列），执行中逐项勾选
- `complete_plan` 门控保持现状（evidence-based），verification todos 仅作跟踪/提醒
- 全部改动局限在 `packages/core/src/agent/plan/`，不碰 app/UI

**Non-Goals:**
- 不扩展 TodoItem 结构（不加 evidence 字段）
- 不改变 `complete_plan` 门控语义（方案 A）
- 不改 `## Plan` 文本 fallback 的硬校验（无法验证 key_files，靠 prompt 引导）
- 不做 allowedPrompts 预批准、planWasEdited、版本化文件名（属后续 change）

## Decisions

### 1. `key_files` 必填：schema 校验 + prompt 引导双层

**做法**：`create-plan-tool.ts` 把 `key_files` 从 `z.array(z.string()).optional()` 改为 `z.array(z.string()).min(1)`（字段仍用 `keyFiles` 传给 `applyStructuredPlan`）。planning prompt 明确要求"输出 3-5 个关键文件"。executing prompt 增加"先读 Key files 再动手"。

**备选**：加运行时校验（类似 `isUsableVerification`）。→ 未采用：zod `.min(1)` 已足够，schema 层校验比手写运行时校验更简洁且自动带错误消息。`applyStructuredPlan` 内部无需再校验（schema 已挡），但可保留防御性判断。

**fallback 路径**：`extract-plan.ts` 不解析 Key files 段，所以 `## Plan` 文本路径无法硬校验——由 planning prompt 引导，不报错（对应 spec 的 "Free-form plan text is guided, not hard-gated"）。

### 2. Verification seed 成 todos：复用 seed 路径 + 来源标记

**做法**：在 `seedTodosFromSteps` 中，除了 steps 之外，用 `parseVerificationItemsFromText(input.verification)`（或从 planMarkdown 解析）得到 verification 条目，追加为 plan todos。为了区分来源（步骤 vs 验证），给验证 todo 的 content 加统一前缀（如 `[verify] `），这样：
- agent 在执行中能识别"这是验证项，跑完勾掉"
- `maybeEnterRetro` 无需改逻辑（所有 plan todo 完成才进 retro，正好要求验证项也完成）
- `applyDoneMarkers`（`[DONE:n]` 按序号）不受影响——验证 todo 追加在 steps 之后，序号映射保持 steps 优先

**具体落点**：`seedTodosFromSteps` 目前 `todoManager.update(steps.map(...), PLAN_TODO_TITLE)`。改为 `update([...stepsTodoInputs, ...verificationTodoInputs], PLAN_TODO_TITLE)`。

**verification 数据来源**：`applyPlanArtifact` 接收的 `planMarkdown` 已含 `**Verification:**` 段，用 `parseVerificationItemsFromPlanMarkdown`（`plan-verification.ts:54`）解析——它同时兼容工具输入和文本 fallback 路径。

**备选**：Verification 用独立的 todo 标题/独立列表。→ 未采用：TodoManager 同一时间只有一个活动列表（`getTitle()`），独立列表需要额外的并行列表机制，改动面大且与 `maybeEnterRetro` 冲突。追加到同一 plan todos 列表并用前缀区分，是最小侵入方案。

### 3. `complete_plan` 门控保持现状

**做法**：不改 `gateCompletePlanVerification`。verification todos 勾选只反映"跑过并标记过"，`complete_plan` 仍要求结构化 `verificationResults`（item/passed/evidence）。prompt 在 executing 阶段引导"标记 Verification todo，并在 retro 提交完整 results"。

**理由**：方案 A 明确不扩展 TodoItem（无 evidence 字段），若让门控读 todo 状态则丢失 evidence 维度，验证可信度反而下降。

## Risks / Trade-offs

- **验证 todo 与 steps todo 混在一个列表** → 用 `[verify]` 前缀区分 + executing prompt 说明；`maybeEnterRetro` 要求全完成正好把"验证项完成"纳入 retro 触发，符合目标。
- **`[DONE:n]` 序号与验证 todo 的交互** → 验证 todo 追加在 steps 之后，`extractDoneSteps` 按 steps 数量解析，验证项靠 todo 工具标记而非 `[DONE]`；需在 executing prompt 说明。
- **key_files 必填可能让模型在 fallback 场景困惑** → schema 错误消息 + planning prompt 明确"3-5 个关键文件"；update_plan 也走同一 schema，保持一致。
- **旧 plan 无 Verification 段** → `parseVerificationItemsFromPlanMarkdown` 返回空数组，不追加验证 todo，行为与现状一致（`maybeEnterRetro` 正常）。
- **验证 todo 被 agent 误当步骤** → 前缀 + prompt 措辞缓解；即便误标，`complete_plan` 门控仍是最终防线。

## Migration Plan

- 纯增量：`key_files` 必填只影响新写 plan；旧 plan 文件加载（`/plan load`）不校验 key_files，兼容。
- 无数据迁移、无外部依赖、无配置变更。
- 回滚：单个 commit 内 revert 即可（改动集中 plan 域）。

## Open Questions

- 验证 todo 前缀文案（`[verify]`）是否合适，或改用其他区分方式（如优先级/分组）——默认 `[verify]`，可后续调整。
