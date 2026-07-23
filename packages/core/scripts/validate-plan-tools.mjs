/**
 * Validation for plan-mode tool exclusions, planning prompts, and structured plans.
 *
 * Run: pnpm --filter @my-agent/core run validate:plan-tools
 */
import assert from "node:assert/strict";

import {
  PLAN_AUTHORING_TOOL_NAMES,
  PLAN_MODE_EXCLUDED_TOOL_NAMES,
  PlanModeController,
  buildPlanModePlanningPrompt,
  buildPlanModeReadyPrompt,
  formatStructuredPlanMarkdown,
  isPlanModeForbiddenTool,
} from "../dist/dev.mjs";

assert.ok(!PLAN_MODE_EXCLUDED_TOOL_NAMES.has("task"), "task must remain available in plan mode");
assert.ok(PLAN_MODE_EXCLUDED_TOOL_NAMES.has("write_file"));
assert.ok(PLAN_MODE_EXCLUDED_TOOL_NAMES.has("edit_file"));
assert.ok(PLAN_MODE_EXCLUDED_TOOL_NAMES.has("delete_file"));
assert.ok(PLAN_MODE_EXCLUDED_TOOL_NAMES.has("kill_command"));
assert.equal(isPlanModeForbiddenTool("task"), false);
assert.equal(isPlanModeForbiddenTool("write_file"), true);
assert.equal(isPlanModeForbiddenTool("mcp__foo"), true);
assert.ok(PLAN_AUTHORING_TOOL_NAMES.has("create_plan"));
assert.ok(PLAN_AUTHORING_TOOL_NAMES.has("update_plan"));

const planning = buildPlanModePlanningPrompt();
assert.ok(planning.includes("task"), "planning prompt must mention task exploration");
assert.ok(planning.includes("create_plan"), "planning prompt must mention create_plan");
assert.ok(planning.includes("ask_user"), "planning prompt must mention ask_user for clarifying questions");
assert.ok(/clarif/i.test(planning));

const ready = buildPlanModeReadyPrompt("## Plan\n1. Do thing");
assert.ok(ready.includes("task"));
assert.ok(ready.includes("update_plan"));
assert.ok(ready.includes("/plan execute"));

const md = formatStructuredPlanMarkdown({
  goal: "Add worktree support",
  steps: ["Survey CoreEnv rootPath", "Design API", "Implement"],
  keyFiles: ["packages/core/src/env.ts"],
  risks: "Path confusion",
  verification: "pnpm build:core",
});
assert.ok(md.includes("## Plan"));
assert.ok(md.includes("**Goal:**"));
assert.ok(md.includes("1. Survey"));
assert.ok(md.includes("`packages/core/src/env.ts`"));

const events = [];
const controller = new PlanModeController({
  emitEvent: (type, data) => events.push({ type, data }),
  getTodoManager: () => null,
});
controller.enable();
const applied = controller.applyStructuredPlan({
  goal: "Ship feature",
  steps: ["Explore", "Implement", "Verify"],
  keyFiles: ["a.ts"],
});
assert.equal(applied.ok, true);
assert.equal(controller.getPhase(), "ready");
assert.equal(controller.getState().steps.length, 3);
assert.ok(events.some((e) => e.type === "plan:ready"));

const rejected = controller.applyStructuredPlan({ goal: "", steps: [] });
assert.equal(rejected.ok, false);

console.log("validate:plan-tools OK");
