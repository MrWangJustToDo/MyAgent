import assert from "node:assert/strict";
import test from "node:test";
import { URL } from "node:url";

const {
  clearExtensionCommands,
  extensionCommandToSlashCommand,
  getAllCommands,
  getCommand,
  registerExtensionCommand,
  splitExtensionCommandArgs,
} = await import(new URL("../dist/index.mjs", import.meta.url).href);

test("splitExtensionCommandArgs trims and splits argv", () => {
  assert.deepEqual(splitExtensionCommandArgs(""), []);
  assert.deepEqual(splitExtensionCommandArgs("  a  b "), ["a", "b"]);
});

test("extensionCommandToSlashCommand maps execute result and errors", async () => {
  const emptyCtx = {
    inputActions: {},
    getInputState: () => ({}),
    getAgent: () => null,
  };

  const ok = extensionCommandToSlashCommand({
    name: "ping",
    description: "ping",
    execute: async (args) => `pong:${args.join(",")}`,
  });
  assert.deepEqual(await ok.execute("x y", emptyCtx), { ok: true, message: "pong:x,y" });

  const fail = extensionCommandToSlashCommand({
    name: "boom",
    description: "boom",
    execute: async () => {
      throw new Error("nope");
    },
  });
  assert.deepEqual(await fail.execute("", emptyCtx), { ok: false, error: "nope" });
});

test("registerExtensionCommand skips built-in name conflicts and clears independently", () => {
  clearExtensionCommands();
  assert.equal(getCommand("help")?.name, "help");

  const before = getAllCommands().length;
  const registered = registerExtensionCommand({
    name: "ext-ping",
    description: "extension ping",
    usage: "/ext-ping",
    execute: () => ({ ok: true, message: "pong" }),
  });
  assert.equal(registered, true);
  assert.equal(getCommand("ext-ping")?.description, "extension ping");
  assert.equal(getAllCommands().length, before + 1);

  const skipped = registerExtensionCommand({
    name: "help",
    description: "should not replace",
    usage: "/help",
    execute: () => ({ ok: true }),
  });
  assert.equal(skipped, false);
  assert.equal(getCommand("help")?.description, "Show available commands");

  clearExtensionCommands();
  assert.equal(getCommand("ext-ping"), undefined);
  assert.equal(getCommand("help")?.name, "help");
});
