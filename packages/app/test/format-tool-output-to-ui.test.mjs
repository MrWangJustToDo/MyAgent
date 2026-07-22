import { clearToUI, registerToUI } from "@my-agent/core";
import assert from "node:assert/strict";
import test from "node:test";
import { URL } from "node:url";

const { formatToolOutput } = await import(new URL("../dist/index.mjs", import.meta.url).href);

test("formatToolOutput prefers registered toUI for extension tools", () => {
  clearToUI();
  registerToUI("ext_echo", (result) => {
    const echoed = result && typeof result === "object" && "echoed" in result ? String(result.echoed) : "";
    return `echo → ${echoed}`;
  });

  assert.equal(formatToolOutput({ echoed: "hi" }, "ext_echo"), "echo → hi");
  assert.equal(formatToolOutput({ echoed: "hi" }, "unknown_ext"), "");

  clearToUI();
  assert.equal(formatToolOutput({ echoed: "hi" }, "ext_echo"), "");
});
