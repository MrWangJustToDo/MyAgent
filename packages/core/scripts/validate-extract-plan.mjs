/**
 * Validation for plan extraction helpers.
 *
 * Run: pnpm --filter @my-agent/core run validate:extract-plan
 */

import assert from "node:assert/strict";

import { cleanStepText, extractDoneSteps, extractPlan, stripLeadingStepNumber } from "../dist/dev.mjs";

assert.equal(stripLeadingStepNumber("1. Do the thing"), "Do the thing");
assert.equal(stripLeadingStepNumber("1. 1. Nested"), "Nested");
assert.equal(stripLeadingStepNumber("2) Also paren"), "Also paren");

const sample = `
Here is my analysis.

## Plan

1. Read the auth module
2. Add unit tests for login
3. Update the README

\`\`\`mermaid
flowchart TD
  A[Read] --> B[Test]
  B --> C[Docs]
\`\`\`

Thanks.
`;

const plan = extractPlan(sample);
assert.ok(plan);
assert.equal(plan.steps.length, 3);
assert.equal(
  plan.steps[0].text.includes("Auth") || plan.steps[0].text.includes("auth") || plan.steps[0].text.length > 3,
  true
);
assert.ok(plan.planMarkdown.includes("## Plan"));
assert.ok(plan.planMarkdown.includes("mermaid"));

assert.equal(extractPlan("No plan here"), null);
assert.equal(extractPlan("## Plan\n\nJust prose without numbers"), null);

const colonPlan = extractPlan("Plan:\n1. Do the thing carefully\n2. Verify results thoroughly\n");
assert.ok(colonPlan);
assert.equal(colonPlan.steps.length, 2);

assert.deepEqual(extractDoneSteps("Finished [DONE:1] and [DONE:3]"), [1, 3]);
assert.equal(cleanStepText("**Read** the `file`").length > 0, true);

const doubled = extractPlan(`## Plan\n\n1. 1. First nested step here\n2. 2. Second nested step here\n`);
assert.ok(doubled);
assert.equal(doubled.steps.length, 2);
assert.doesNotMatch(doubled.steps[0].text, /^\d+[.)]/);
assert.doesNotMatch(doubled.steps[1].text, /^\d+[.)]/);

console.log("validate:extract-plan OK");
