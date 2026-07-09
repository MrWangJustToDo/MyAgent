import assert from "node:assert/strict";

import { resolveSubagentBridgeUI } from "../dist/dev.mjs";

assert.equal(resolveSubagentBridgeUI({}), false);
assert.equal(resolveSubagentBridgeUI({ bridgeUI: false }), false);
assert.equal(resolveSubagentBridgeUI({ bridgeUI: true }), true);
assert.equal(resolveSubagentBridgeUI({ parentTaskToolCallId: "tc_1" }), true);
assert.equal(
  resolveSubagentBridgeUI({ parentTaskToolCallId: "tc_1", bridgeUI: false }),
  false,
  "explicit bridgeUI=false should disable UI even with parentTaskToolCallId"
);

console.log("subagent-bridge-ui validation passed");
