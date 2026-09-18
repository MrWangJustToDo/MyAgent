/**
 * `undefined` (unknown) and `[]` (declared none) must stay different at every hop.
 *
 * These two states look alike and mean opposite things:
 *
 *   - `undefined` — nothing was declared. `CapabilityProbe.hasCapability` is permissive, so the
 *     gates allow everything. Correct for a model we cannot describe.
 *   - `[]` — capabilities were resolved and the model declares none. The gates are strict, so a
 *     text-only model really does have its images stripped before send.
 *
 * `streaming` used to paper over the difference: it was granted to every model purely to keep the
 * list non-empty, because empty was indistinguishable from unknown. With it gone, each hop that
 * touches the value has to preserve the distinction, and two of them did not:
 *
 *   - `mergeModelInfo` tested `override.capabilities.length > 0`, so a caller who explicitly
 *     declared `[]` was silently upgraded to the catalog's list for the same model id.
 *   - `UsageTracker.hasCapability` treated an empty array as unknown, so a resolved model that
 *     declared nothing was exempt from pre-send stripping.
 *
 * `validate:model-capabilities` covers the mapping (metadata → list). This covers the transports
 * (merge, probe), because a correct mapping piped through a collapsing hop is still wrong.
 *
 * Run: pnpm --filter @codent/core run validate:capability-unknown-vs-none
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { UsageTracker, clearCoreEnv, registerCoreEnv, resolveModelConfig } from "../dist/dev.mjs";

// `resolveModelConfig` reads the models.dev CACHE through CoreEnv, so without an env it returns
// `modelInfo: null` and every merge assertion below would pass trivially — the merge would never
// run, and "the override survived" would prove nothing. A real (read-only) env is required for
// these checks to have teeth; the suite skips rather than pretend otherwise.
const CACHE = path.resolve(process.cwd(), "../../.agents/cache/models-dev.json");
const hasCorpus = fs.existsSync(CACHE);

if (hasCorpus) {
  registerCoreEnv({
    rootPath: path.resolve(process.cwd(), "../.."),
    getPlatform: async () => "linux",
    getArch: async () => "arm64",
    getEnv: async () => ({}),
    homedir: async () => path.resolve(process.cwd(), "../.."),
    path: {
      join: (...parts) => parts.join("/"),
      dirname: (p) => {
        const i = p.lastIndexOf("/");
        return i <= 0 ? "/" : p.slice(0, i);
      },
      basename: (p, ext) => {
        const base = p.split("/").pop() ?? p;
        return ext && base.endsWith(ext) ? base.slice(0, -ext.length) : base;
      },
      extname: (p) => {
        const base = p.split("/").pop() ?? p;
        const i = base.lastIndexOf(".");
        return i < 0 ? "" : base.slice(i);
      },
      resolve: (...parts) => parts.join("/"),
      normalize: (p) => p.replace(/\/+/g, "/"),
      isAbsolute: (p) => p.startsWith("/"),
      getSep: () => "/",
      parse: (p) => {
        const base = p.split("/").pop() ?? p;
        const i = base.lastIndexOf(".");
        return {
          root: "/",
          dir: p.slice(0, p.lastIndexOf("/")) || "/",
          base,
          ext: i < 0 ? "" : base.slice(i),
          name: i < 0 ? base : base.slice(0, i),
        };
      },
    },
    fs: {
      readFile: async (p) => fs.readFileSync(p, "utf8"),
      writeFile: async () => {
        throw new Error("read-only");
      },
      appendFile: async () => {
        throw new Error("read-only");
      },
      mkdir: async () => {},
      exists: async (p) => fs.existsSync(p),
      readdir: async (p) =>
        fs
          .readdirSync(p, { withFileTypes: true })
          .map((d) => ({ name: d.name, type: d.isFile() ? "file" : "directory" })),
      remove: async () => {
        throw new Error("read-only");
      },
      stat: async (p) => {
        const st = fs.statSync(p);
        return { size: st.size, isFile: st.isFile(), isDirectory: st.isDirectory() };
      },
    },
    runCommand: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
    exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
    fetch: async () => new Response("", { status: 200 }),
  });
}

const failures = [];

async function check(name, fn) {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures.push({ name, err });
    console.log(`  FAIL ${name}: ${err?.message ?? err}`);
  }
}

/** Guard against a green-but-empty run: the merge checks need the catalog to be reachable. */
async function checkMerge(name, fn) {
  if (!hasCorpus) {
    console.log(`  skip ${name} (no .agents/cache/models-dev.json — run the CLI once to populate)`);
    return;
  }
  // Prove the merge is actually reachable before asserting anything about it, so a broken env
  // stub cannot silently turn these into no-op passes.
  const probe = await resolveModelConfig({ model: "gpt-4o" });
  if (!probe.modelInfo) {
    failures.push({ name, err: new Error("merge unreachable: resolveModelConfig returned no modelInfo") });
    console.log(`  FAIL ${name}: merge unreachable (models.dev lookup did not run)`);
    return;
  }
  await check(name, fn);
}

// ============================================================================
// 1. The metadata merge must not promote "declared none" to the catalog's list
// ============================================================================

await checkMerge("an explicit [] wins over models.dev metadata for the same id", async () => {
  // `gpt-4o` carries vision in models.dev. A caller overriding it to [] is stating that this
  // deployment accepts text only, which is exactly the case the old `length > 0` test destroyed.
  const resolved = await resolveModelConfig({
    model: "gpt-4o",
    modelInfo: { id: "gpt-4o", name: "gpt-4o", style: "openai", apiModel: "gpt-4o", capabilities: [] },
  });
  assert.deepEqual(
    resolved.modelInfo?.capabilities,
    [],
    "the caller declared no capabilities; the merge must not substitute the catalog's list"
  );
});

await checkMerge("a caller-provided non-empty list still wins", async () => {
  const resolved = await resolveModelConfig({
    model: "gpt-4o",
    modelInfo: {
      id: "gpt-4o",
      name: "gpt-4o",
      style: "openai",
      apiModel: "gpt-4o",
      capabilities: ["reasoning"],
    },
  });
  assert.deepEqual(resolved.modelInfo?.capabilities, ["reasoning"]);
});

await checkMerge("omitting capabilities does not manufacture an empty declaration", async () => {
  // The mirror-image failure: turning "said nothing" into "declares nothing" would make every
  // bare MODEL_* config strip images it has no basis to strip.
  const resolved = await resolveModelConfig({ model: "gpt-4o" });
  const caps = resolved.modelInfo?.capabilities;
  assert.notDeepEqual(caps, [], "absence of a declaration must not become a declaration of none");
  assert.ok(Array.isArray(caps) && caps.includes("vision"), "models.dev metadata should still supply the list");
});

// ============================================================================
// 2. The probe must treat the two states differently
// ============================================================================

await check("unknown (undefined) is permissive; empty declaration is strict", () => {
  const unknown = new UsageTracker();
  unknown.setCapabilities(undefined);
  for (const cap of ["vision", "audio", "video", "document", "reasoning", "tool_calling"]) {
    assert.equal(unknown.hasCapability(cap), true, `unknown must allow "${cap}"`);
  }
  assert.equal(unknown.getCapabilities(), null, "unknown reads back as null, not an empty set");

  const declaredNone = new UsageTracker();
  declaredNone.setCapabilities([]);
  for (const cap of ["vision", "audio", "video", "document", "reasoning", "tool_calling"]) {
    assert.equal(declaredNone.hasCapability(cap), false, `an empty declaration must deny "${cap}"`);
  }
  assert.deepEqual([...(declaredNone.getCapabilities() ?? [])], [], "empty declaration reads back as an empty set");
});

await check("a text-only model is actually stripped (the behaviour this change fixes)", () => {
  // Before the split, `[]` was permissive, which meant pre-send stripping never engaged for the
  // 330 catalog entries that resolve to no capabilities — images went to endpoints that reject
  // them. This is the end-to-end consequence, asserted through the probe the strip gates on.
  const textOnly = new UsageTracker();
  textOnly.setCapabilities([]);
  assert.equal(
    textOnly.hasCapability("vision"),
    false,
    "a model that declared no capabilities must not be treated as vision-capable"
  );

  const unknownModel = new UsageTracker();
  unknownModel.setCapabilities(undefined);
  assert.equal(
    unknownModel.hasCapability("vision"),
    true,
    "a model with no metadata keeps the permissive behaviour (unchanged)"
  );
});

// ============================================================================

console.log("");
if (failures.length > 0) {
  console.error(`capability-unknown-vs-none validation FAILED (${failures.length} check(s))`);
  for (const f of failures) console.error(`  - ${f.name}: ${f.err?.message ?? f.err}`);
  process.exit(1);
}
clearCoreEnv();
console.log("capability-unknown-vs-none validation passed");
