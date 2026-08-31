## 1. 关键文件强制（key_files required）

- [x] 1.1 将 `create-plan-tool.ts` 中 `structuredPlanInputSchema` 的 `key_files` 从 `z.array(z.string()).optional()` 改为 `z.array(z.string()).min(1)`，并更新 describe 措辞（非空、计划将触及/依赖的文件）
- [x] 1.2 在 `applyStructuredPlan`（`plan-mode-controller.ts`）中增加防御性检查：`keyFiles` 缺失/为空时返回错误 `Plan must include at least one key file`（schema 之外的兜底）
- [x] 1.3 更新 `buildPlanModePlanningPrompt`：在 `create_plan` 工具参数说明中明确 `key_files` 必填，并引导输出 3-5 个关键文件
- [x] 1.4 更新 `buildPlanModeExecutingPrompt`：增加"先读 plan 的 Key files（关键文件）再动手"的指示，使 key_files 成为执行的文件锚点

## 2. Verification checklist seed 为 plan todos（方案 A）

- [x] 2.1 在 `seedTodosFromSteps`（`plan-mode-controller.ts`）中解析 plan 的 Verification 段（复用 `parseVerificationItemsFromPlanMarkdown`），将各条目追加为 plan todos，与 steps 并列，并用统一前缀（如 `[verify] `）区分来源
- [x] 2.2 保持 `maybeEnterRetro` 逻辑不变（所有 plan todos 含验证项完成才进 retro），确认 `applyDoneMarkers`（`[DONE:n]` 按 steps 序号）不受追加验证 todos 影响
- [x] 2.3 更新 `buildPlanModeExecutingPrompt` 与 `buildPlanExecuteSteerMessage`：告知 agent 验证项已作为 todo 逐项标记，跑完勾选；retro 时仍提交 `verificationResults`（item/passed/evidence）
- [x] 2.4 确认 `complete_plan` 门控（`gateCompletePlanVerification`）不变：verification todos 仅作跟踪/提醒，不替代 evidence-based 门控

## 3. 验证

- [x] 3.1 `pnpm build:core`（或受影响包构建）通过
- [x] 3.2 `pnpm typecheck` 通过
- [x] 3.3 `pnpm lint` 通过（含 ESLint import/order，Prettier 查不到的部分）
- [x] 3.4 手动/脚本验证：`create_plan` 缺 `key_files` 被拒；带 verification 的 plan 应用后 todos 含验证项；旧 plan（无 Verification 段）不追加验证 todos
