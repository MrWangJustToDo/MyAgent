## Why

plan 产物的价值取决于它能否直接驱动执行、并在执行中逐项可证。当前 plan 有两个机制短板：(1) `key_files` 是可选的，plan 往往缺少文件定位，execute 阶段需重新探索；(2) Verification checklist 只在整个执行结束后由 `complete_plan` 一次性提交，验证与执行过程脱节，无法中途逐项证明进度。

## What Changes

- **关键文件强制（`key_files`）**：`create_plan` / `update_plan` 的 `key_files` 从可选改为必填（至少 1 个），planning prompt 要求输出 3-5 个关键文件，executing prompt 强调先读 Key files 再动手。`## Plan` 文本 fallback 无法硬校验，由 planning prompt 引导（不报错）。
- **Verification seed 成 todos（方案 A）**：plan 应用时把 Verification checklist 项追加为 plan 的 todo（与 Steps 并列，标记来源），执行中 agent 逐项完成并勾选；`complete_plan` 门控保持不变（仍要求 `verificationResults[]` 逐项 + evidence），todo 勾选作为进度跟踪与强制提醒，不替代门控。
- 无 breaking change：现有 plan 文件/会话兼容，`key_files` 缺省的旧文件加载仍可用（仅新写 plan 强制）。

## Capabilities

### New Capabilities

- `plan-key-files`: plan 产物强制携带关键文件定位，planning/executing prompt 据此引导，使 plan 可直接驱动 execute 而无需重新探索。
- `plan-verification-todos`: plan 的 Verification checklist 逐项 seed 为 todo，执行中逐项勾选跟踪，与 `complete_plan` 门控并存。

### Modified Capabilities

<!-- 无：现有 openspec/specs/ 下无 plan 相关 spec；本 change 新增以上两个 capability。 -->

## Impact

- `packages/core/src/agent/plan/create-plan-tool.ts` — `key_files` schema 必填 + 校验
- `packages/core/src/agent/plan/plan-mode-controller.ts` — seed todos 时追加 verification 项；状态字段记录 verification 来源
- `packages/core/src/agent/plan/plan-prompts.ts` — planning/executing prompt 措辞更新
- `packages/core/src/agent/plan/plan-verification.ts` — 复用 `parseVerificationItemsFromText`（已有）
- `packages/core/src/agent/todo-manager/` — 无需改动（复用 update 接口）
- 影响范围：core 内 plan 域，不改 app/UI；无 API 破坏
