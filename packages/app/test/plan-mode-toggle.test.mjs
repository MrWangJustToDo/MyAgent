/**
 * Validation for plan-mode toggle feedback helper (mirrors src/utils/plan-mode-toggle.ts).
 *
 * Run: node packages/app/test/plan-mode-toggle.test.mjs
 */
import assert from "node:assert/strict";

function togglePlanModeWithFeedback(agent, setFeedback) {
  if (!agent) return false;
  const phase = agent.togglePlanMode();
  if (phase === "planning") {
    setFeedback("Plan mode on — explore read-only, then create_plan", "info");
  } else {
    setFeedback("Plan mode off", "info");
  }
  return true;
}

const messages = [];
assert.equal(
  togglePlanModeWithFeedback(null, (m) => messages.push(m)),
  false
);
assert.equal(messages.length, 0);

let phase = "off";
const agent = {
  togglePlanMode() {
    phase = phase === "off" ? "planning" : "off";
    return phase;
  },
};

assert.equal(
  togglePlanModeWithFeedback(agent, (m, level) => messages.push({ m, level })),
  true
);
assert.equal(phase, "planning");
assert.match(messages.at(-1).m, /Plan mode on/);
assert.equal(messages.at(-1).level, "info");

assert.equal(
  togglePlanModeWithFeedback(agent, (m, level) => messages.push({ m, level })),
  true
);
assert.equal(phase, "off");
assert.match(messages.at(-1).m, /Plan mode off/);

console.log("plan-mode-toggle validation passed");
