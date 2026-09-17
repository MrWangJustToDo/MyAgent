/**
 * Validates that disabling an extension restores what its tool registration displaced.
 *
 * Run: pnpm --filter @my-agent/core run validate:extension-tool-restore
 *
 * Background. `ExtensionRegistryService.registerTool` writes straight into the agent's live
 * tools record, which is the ONLY holder of the previous tool — nothing keeps a copy of the
 * built-ins (`agent-factory.ts` spreads `createTools()` into the record and drops the local).
 * `unregisterExtensionTool` therefore used to `delete` the name unconditionally, so an
 * extension that shadowed `read_file` took the built-in with it on disable: `/extensions`
 * off, `read_file` gone, restart required.
 *
 * Two more things the same overwrite broke, both silent:
 *
 *   - `toModelOutputRegistry` is process-global and was never rolled back, so the unloaded
 *     extension's shaper kept formatting the restored tool's results for the model
 *     (`apply-tool-compact.ts` reads it on every model call).
 *   - The presentation descriptor went with it (already handled: `validate:tool-presentation`
 *     pins the 34 built-in declarations to the fallback table, which resumes control).
 *
 * What is pinned here:
 *
 *   1. a shadowed built-in comes back on unregister, with its own tool object
 *   2. the extension's `toModelOutput` is rolled back to the built-in's
 *   3. an extension tool that shadowed nothing is still simply removed
 *   4. two extensions on one name: disabling the newer one gives the name back to the older,
 *      and only the last one out removes it (the ledger is keyed by owner, so a handover
 *      must not resurrect the built-in underneath both)
 */

import assert from "node:assert/strict";

import { createTanStackTools, ExtensionRunner, ManagedAgent, toModelOutputRegistry } from "../dist/dev.mjs";

// ============================================================================
// Harness
// ============================================================================

function makeAgent(tools) {
  return new ManagedAgent(
    { id: "agent_restore", name: "restore-probe", model: "gpt-4" },
    {
      context: {
        getMessages: () => [],
        getUIMessages: () => [],
        reset: () => {},
        setMessages: () => {},
        setUIMessages: () => {},
        getMessagesForLLM: () => [],
      },
      log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, agent: () => {}, clear: () => {} },
      tools,
      todoManager: null,
    }
  );
}

/** Real built-in tool objects — each has already declared its `present` + `toModelOutput`. */
async function makeBuiltinAgent() {
  const builtins = await createTanStackTools();
  const record = Object.fromEntries(builtins.map((tool) => [tool.name, tool]));
  return { managed: makeAgent(record), builtinReadFile: record.read_file };
}

/** A minimal extension tool definition. `shaper` stands in for the tool's model-facing output. */
function extTool(description, shaper) {
  const def = {
    name: "read_file",
    description,
    inputSchema: { type: "object", properties: {} },
    execute: async () => ({}),
  };
  if (shaper) def.toModelOutput = () => shaper;
  return def;
}

/** Shape a stored result the way the wire does, so "whose handler won" is observable. */
function shaped() {
  return toModelOutputRegistry.get("read_file")?.({ toolCallId: "c1", input: {}, output: {} });
}

// ============================================================================
// 1. A shadowed built-in comes back
// ============================================================================

{
  const { managed, builtinReadFile } = await makeBuiltinAgent();
  const builtinShaper = shaped();
  assert.equal(
    typeof builtinShaper,
    "string",
    "the built-in read_file must own a model shaper (its output is the shaper's own text)"
  );

  managed.registerTool(extTool("extension read (overwrites the built-in)", "EXTENSION SHAPING"));
  assert.notEqual(managed.tools.read_file, builtinReadFile, "the extension must have taken the name");
  assert.equal(
    shaped(),
    "EXTENSION SHAPING",
    "the extension's shaper must win while it is registered (otherwise this probe proves nothing)"
  );

  managed.unregisterExtensionTool("read_file");

  assert.ok(managed.tools.read_file, "the built-in read_file must be restored, not deleted");
  assert.equal(
    managed.tools.read_file,
    builtinReadFile,
    "the restored tool must be the original built-in object, not a re-created one"
  );
}

// ============================================================================
// 2. The extension's `toModelOutput` is rolled back
// ============================================================================

{
  const { managed } = await makeBuiltinAgent();
  const builtinShaper = shaped();

  managed.registerTool(extTool("extension read", "EXTENSION SHAPING"), "ext_a");
  managed.unregisterExtensionTool("read_file", "ext_a");

  assert.equal(
    shaped(),
    builtinShaper,
    "the restored tool must shape results with its own handler — a leftover extension handler " +
      "silently formats every later `read_file` result for the model"
  );
  assert.notEqual(shaped(), "EXTENSION SHAPING", "the unloaded extension's handler must not survive");
}

// ============================================================================
// 3. A tool that was never shadowing anything is removed outright
//
// A name the extension introduced itself: there is no built-in underneath it, so the top of the
// stack is gone and the entry is dropped from the record. (`defineServerTool` seeds the
// incumbent slot, so the stack starts with an `undefined` tool rather than being absent.)
// ============================================================================

{
  const managed = makeAgent({});

  managed.registerTool(
    {
      name: "fresh_tool",
      description: "registered onto an empty record",
      inputSchema: { type: "object", properties: {} },
      execute: async () => ({}),
    },
    "ext_fresh"
  );
  assert.ok(managed.tools.fresh_tool, "registered onto an empty record");

  managed.unregisterExtensionTool("fresh_tool", "ext_fresh");
  assert.ok(!("fresh_tool" in managed.tools), "a tool with nothing underneath it must be removed");
}

// ============================================================================
// 4. Two extensions on one name: the ledger hands the name back in reverse order
// ============================================================================

{
  const { managed, builtinReadFile } = await makeBuiltinAgent();

  managed.registerTool(extTool("first extension", "first"), "first");
  const firstTool = managed.tools.read_file;
  managed.registerTool(extTool("second extension", "second"), "second");
  const secondTool = managed.tools.read_file;
  assert.notEqual(firstTool, builtinReadFile);
  assert.notEqual(secondTool, firstTool);
  assert.equal(shaped(), "second", "the newest registration is the one in force");

  // The newer extension is disabled first: the name goes back to the older one, NOT to the
  // built-in underneath both (popping the wrong ledger entry would expose it early).
  managed.unregisterExtensionTool("read_file", "second");
  assert.equal(managed.tools.read_file, firstTool, "disabling the newer extension must restore the older one's tool");
  assert.notEqual(managed.tools.read_file, builtinReadFile, "the built-in is still shadowed by the first extension");
  assert.equal(shaped(), "first", "the older extension's shaper must be back in force");

  // Only the last one out removes the name for good — which is the built-in returning.
  managed.unregisterExtensionTool("read_file", "first");
  assert.equal(managed.tools.read_file, builtinReadFile, "the built-in returns once every extension is gone");
  assert.notEqual(shaped(), "first", "no extension shaper may survive the last unregister");
}

// ============================================================================
// 5. A handover drops the older owner's ledger entry — through the REAL runner
//
// The runner refuses to unregister a name a newer extension now owns (it must not delete that
// extension's tool), but it MUST still release the older owner's ledger entry: leaving it
// behind means the next unregister of the same name restores a tool from an extension that
// was disabled long ago — and drops the entry that held the tool underneath it.
// ============================================================================

{
  const { managed, builtinReadFile } = await makeBuiltinAgent();

  // The runner's production wiring, so `setEnabled` exercises the real ownership check.
  const runner = new ExtensionRunner({
    getEnvVar: () => undefined,
    onRegisterTool: (def, ownerId) => managed.registerTool(def, ownerId),
    onUnregisterTool: (name, ownerId) => managed.unregisterExtensionTool(name, ownerId),
  });

  const makeExt = (description) => ({
    id: description,
    name: description,
    version: "1.0.0",
    activate(ctx) {
      ctx.registerTool({
        name: "read_file",
        description,
        inputSchema: { type: "object", properties: {} },
        execute: async () => ({}),
      });
    },
  });

  await runner.loadExtension(makeExt("first"));
  const firstTool = managed.tools.read_file;
  assert.notEqual(firstTool, builtinReadFile, "the first extension took the name");

  await runner.loadExtension(makeExt("second"));
  const secondTool = managed.tools.read_file;
  assert.notEqual(secondTool, firstTool, "the second extension took the name from the first");

  // Disable the FIRST extension. It no longer owns the name, so its tool must stay — but its
  // ledger entry has to go, and the entry that overwrote it must inherit what IT displaced
  // (the built-in). Splice-and-forget would orphan that link.
  await runner.setEnabled("first", false);
  assert.equal(managed.tools.read_file, secondTool, "the surviving owner's tool must not be touched");

  await runner.setEnabled("second", false);
  assert.equal(
    managed.tools.read_file,
    builtinReadFile,
    "the built-in underneath both extensions must come back — a stale orphaned entry hands " +
      "back a tool belonging to an extension that is no longer loaded"
  );
  assert.notEqual(managed.tools.read_file, firstTool, "the disabled first extension's tool must not resurface");

  await runner.destroyAll();
}

// ============================================================================
// 6. One owner registering the same name twice is released as a unit
//
// An extension can register a name twice inside a single `activate` (a config-driven extension
// building the list, then appending). Both registrations belong to the same owner, and the
// owner is disabled as a whole, so ONE release has to settle the name back to the tool it
// shadowed — and the runner's second (now redundant) call must be a no-op rather than a
// second restore.
//
// An earlier design kept one ledger entry per registration and unwound them one at a time,
// which is where this case was pinned. A stack makes that distinction unnecessary: entries are
// keyed by owner, so an owner's entries for a name go away together, and "remove this owner and
// re-read the top" is the only rule.
// ============================================================================

{
  const { managed, builtinReadFile } = await makeBuiltinAgent();

  managed.registerTool(extTool("registration one", "one"), "same-owner");
  managed.registerTool(extTool("registration two", "two"), "same-owner");
  assert.equal(shaped(), "two", "the newest registration of the owner is live");

  managed.unregisterExtensionTool("read_file", "same-owner");
  assert.equal(
    managed.tools.read_file,
    builtinReadFile,
    "releasing the owner must settle the name on what it shadowed, not leave its own tool behind"
  );
  assert.equal(shaped(), "{}", "and the built-in's own shaper is in force again");

  // The runner calls the hook once per registration, so it calls again here. Nothing is left
  // to remove; that must not re-write the record or resurrect anything.
  managed.unregisterExtensionTool("read_file", "same-owner");
  assert.equal(managed.tools.read_file, builtinReadFile, "the redundant release must be a no-op");
  assert.equal(shaped(), "{}", "and must not disturb the handler either");
}

// ============================================================================
// 7. An owner with no ledger entry never deletes the name
//
// `unregisterExtensionTool` is reachable with an owner that never registered this name (a
// host calling it directly, a registration that happened before the ledger existed). The one
// thing it must never do is remove a tool that is not its own — that is the original defect
// wearing a different hat.
// ============================================================================

{
  const { managed, builtinReadFile } = await makeBuiltinAgent();

  managed.unregisterExtensionTool("read_file", "ext_that_never_registered_this");
  assert.ok(managed.tools.read_file, "an unknown owner must not delete the name");
  assert.equal(managed.tools.read_file, builtinReadFile, "and must leave the current tool exactly as it is");
}

// ============================================================================
// 8. The full disable sequence — through the real runner
//
// Section 5 disables the older extension first (a handover) and section 6 covers one owner
// registering twice, so neither ever reached the case where the runner finds NO owner at all
// (`toolOwners.get(name) !== id` AND `has(name) === false`). That is what happens once the
// name's last owner was unregistered earlier: its ownership record is deleted without one
// being added, so a later disable of a stale holder arrives as a release with `stillOwned:
// false` — the last holder leaving, which must restore rather than only drop the entry.
//
// Section 5's extensions also had no `toModelOutput`, so a wrong model-output handler was
// invisible even when the tool object came back correctly.
// ============================================================================

{
  const newSeq = async () => {
    const { managed, builtinReadFile } = await makeBuiltinAgent();
    const runner = new ExtensionRunner({
      getEnvVar: () => undefined,
      onRegisterTool: (def, ownerId) => managed.registerTool(def, ownerId),
      onUnregisterTool: (name, ownerId) => managed.unregisterExtensionTool(name, ownerId),
    });
    const makeExt = (id) => ({
      id,
      name: id,
      version: "1.0.0",
      activate(ctx) {
        ctx.registerTool({
          name: "read_file",
          description: `TOOL-${id}`,
          inputSchema: { type: "object", properties: {} },
          execute: async () => ({}),
          toModelOutput: () => `SHAPER-${id}`,
        });
      },
    });
    await runner.loadExtension(makeExt("ext_old"));
    const oldTool = managed.tools.read_file;
    await runner.loadExtension(makeExt("ext_new"));
    const newTool = managed.tools.read_file;
    await runner.setEnabled("ext_new", false); // the name's owner leaves first
    return { managed, runner, builtinReadFile, oldTool, newTool };
  };

  // 8a. After the owner is disabled the older extension's tool is back in the record, but it no
  // longer owns the name — so disabling IT is the `stillOwned: false` path, and it is the last
  // holder leaving. The built-in has to come back for real: both the tool object AND the
  // model-output handler, the latter being process-global and therefore impossible to restore
  // by "just leaving it alone".
  {
    const { managed, builtinReadFile, oldTool, newTool } = await newSeq();
    assert.equal(managed.tools.read_file, oldTool, "disabling the owner hands the name back to the older tool");
    assert.equal(shaped(), "SHAPER-ext_old", "and to that tool's own handler");

    managed.unregisterExtensionTool("read_file", "ext_old");

    assert.equal(
      managed.tools.read_file,
      builtinReadFile,
      "the last holder leaving must RESTORE, not merely drop its ledger entry — only dropping it " +
        "leaves the built-in shadowed by an extension that is already disabled"
    );
    assert.notEqual(managed.tools.read_file, oldTool, "the disabled extension's tool must not survive");
    assert.notEqual(newTool, builtinReadFile);
    assert.equal(shaped(), "{}", "and its process-global handler must be rolled back to the built-in's");
  }

  // 8b. The same sequence driven end-to-end through the runner, so the flag is the one the
  // runner computes rather than one the test supplies.
  {
    const { managed, runner, builtinReadFile, oldTool } = await newSeq();
    await runner.setEnabled("ext_old", false);
    assert.notEqual(managed.tools.read_file, oldTool, "the older extension's tool must be gone");
    assert.equal(
      managed.tools.read_file,
      builtinReadFile,
      "disabling both extensions, owner first, must leave the built-in"
    );
    assert.equal(shaped(), "{}", "the built-in's handler is in force once nothing shadows it");
    await runner.destroyAll();
  }
}

// ============================================================================
// 7. Re-registering a name by the same owner is replace, not stack
//
// `defineServerTool` runs once per agent for the same built-in names (`createTools()` is
// re-run per agent), all under the owner default of the tool name itself. A blind push would
// grow the stack entry by entry for every agent created in the process, so the shared registry
// must treat "same owner registers again" as a replacement. Otherwise memory grows with the
// number of agents and `has()`/`get()` stop reflecting a single live registration.
// ============================================================================

{
  const { managed } = await makeBuiltinAgent();

  // The built-in already registered `read_file`; re-creating the agent's tools must not add
  // another entry for it.
  const before = toModelOutputRegistry.stackDepth("read_file");
  const { managed: second } = await makeBuiltinAgent();
  const after = toModelOutputRegistry.stackDepth("read_file");
  assert.ok(second.tools.read_file, "a second agent also gets read_file");
  assert.equal(
    after,
    before,
    "re-registering an existing tool name must replace the owner's entry, not stack another — " +
      "otherwise the shared registry grows once per agent created"
  );
  assert.ok(managed.tools.read_file);
}

console.log("extension-tool-restore validation passed");
