/**
 * Capability-mapping guard for models.dev metadata.
 * (change: add-extension-message-transform)
 *
 * `parseModelsDevModel` translates provider metadata into our `ModelCapability[]`, and every
 * downstream gate reads that list through `hasCapability` — which is **permissive** when the
 * list is empty. So both failure directions matter:
 *
 *   - a capability granted without metadata evidence is a silent authorization (the caller
 *     believes the model supports something nobody checked);
 *   - a capability list that comes back EMPTY after a successful parse flips every gate to
 *     "unknown → allow", because empty means unknown to the probe.
 *
 * This drives the real `deriveCapabilities` against the real cached models.dev payload, so it
 * tests the mapping rather than a restatement of it. When the cache is absent (fresh clone,
 * offline) the corpus checks are skipped with a notice — the invariant checks still run.
 *
 * Run: pnpm --filter @my-agent/core run validate:model-capabilities
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  MODEL_CAPABILITIES,
  MODELS_DEV_COST_FIELDS,
  MODELS_DEV_MODEL_FIELDS,
  RUNTIME_TRUE_CAPABILITIES,
  deriveCapabilities,
} from "../dist/dev.mjs";

const errors = [];

function check(name, fn) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (err) {
    errors.push({ name, err });
    console.log(`  FAIL ${name}: ${err?.message ?? err}`);
  }
}

// ============================================================================
// 1. Invariants on the declared capability surface
// ============================================================================

check("every runtime-true capability is a declared capability", () => {
  for (const cap of RUNTIME_TRUE_CAPABILITIES) {
    assert.ok(MODEL_CAPABILITIES.includes(cap), `"${cap}" is not in MODEL_CAPABILITIES`);
  }
});

check("runtime-true capabilities are granted from the transport, not metadata", () => {
  // A mapping that reads them from metadata would make this list lie. Assert they are granted
  // for an entry with NO metadata signal at all — which is the plain-text-model case.
  const caps = deriveCapabilities({});
  for (const cap of RUNTIME_TRUE_CAPABILITIES) {
    assert.ok(caps.includes(cap), `"${cap}" must be granted even with no metadata signal`);
  }
  assert.equal(caps.length, RUNTIME_TRUE_CAPABILITIES.length, "nothing else may be granted without evidence");
});

check("a parse with no metadata signal never yields an empty list", () => {
  // Load-bearing: `hasCapability` reads an empty list as "unknown" and allows everything.
  assert.ok(deriveCapabilities({}).length > 0, "empty result would authorize every modality");
});

// ============================================================================
// 2. Mapping rules — exact, both directions
// ============================================================================

check("modalities.input is authoritative for each multimedia capability", () => {
  const expect = { image: "vision", audio: "audio", video: "video", pdf: "document" };
  for (const [modality, capability] of Object.entries(expect)) {
    const caps = deriveCapabilities({ modalities: { input: ["text", modality] } });
    assert.ok(caps.includes(capability), `modality "${modality}" must grant "${capability}"`);
  }
});

check("a text-only modalities list grants no multimedia capability", () => {
  const caps = deriveCapabilities({ modalities: { input: ["text"] } });
  for (const cap of ["vision", "audio", "video", "document"]) {
    assert.ok(!caps.includes(cap), `"${cap}" must not be granted for text-only input`);
  }
});

check("attachment alone does not grant document (it cannot distinguish)", () => {
  // Regression guard: expanding `attachment` into vision+document marked 34% of the catalog
  // document-capable when only 23% accept pdf.
  const caps = deriveCapabilities({ attachment: true });
  assert.ok(caps.includes("vision"), "attachment evidences image input");
  assert.ok(!caps.includes("document"), "attachment alone must NOT grant document");
});

check("attachment is not consulted when modalities.input is present", () => {
  const caps = deriveCapabilities({ attachment: true, modalities: { input: ["text"] } });
  assert.ok(!caps.includes("vision"), "modalities.input is authoritative and says text-only");
});

check("boolean metadata fields map one-to-one", () => {
  const expected = {
    reasoning: "reasoning",
    tool_call: "tool_calling",
    structured_output: "json_output",
  };
  for (const [field, capability] of Object.entries(expected)) {
    const caps = deriveCapabilities({ [field]: true });
    assert.ok(caps.includes(capability), `"${field}: true" must grant "${capability}"`);
    assert.ok(!deriveCapabilities({ [field]: false }).includes(capability), `"${field}: false" must not grant it`);
  }
});

check("prompt_caching follows cache pricing, not its absence", () => {
  assert.ok(deriveCapabilities({ cost: { cache_read: 0.1 } }).includes("prompt_caching"));
  assert.ok(deriveCapabilities({ cost: { cache_write: 0.1 } }).includes("prompt_caching"));
  assert.ok(!deriveCapabilities({ cost: { input: 1, output: 2 } }).includes("prompt_caching"));
});

check("no capability is granted twice", () => {
  const caps = deriveCapabilities({
    reasoning: true,
    attachment: true,
    tool_call: true,
    structured_output: true,
    cost: { cache_read: 1 },
    modalities: { input: ["text", "image", "pdf"] },
  });
  assert.equal(new Set(caps).size, caps.length, `duplicates in ${caps.join(",")}`);
});

// ============================================================================
// 3. Corpus checks against the real cached metadata (skipped when absent)
// ============================================================================

const cachePath = path.resolve(process.cwd(), "../../.agents/cache/models-dev.json");

if (!fs.existsSync(cachePath)) {
  console.log("  skip corpus checks (no .agents/cache/models-dev.json — run the CLI once to populate)");
} else {
  const payload = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  const entries = [];
  for (const provider of Object.values(payload)) {
    for (const model of Object.values(provider.models ?? {})) entries.push(model);
  }

  check(`corpus: every parsed entry yields a non-empty capability list (${entries.length} models)`, () => {
    const empty = entries.filter((m) => deriveCapabilities(m).length === 0);
    assert.equal(
      empty.length,
      0,
      `${empty.length} entries produced [] — that reads as "unknown" and allows everything`
    );
  });

  check("corpus: no multimedia capability is granted without its metadata evidence", () => {
    const evidence = { vision: "image", audio: "audio", video: "video", document: "pdf" };
    const offenders = [];
    for (const model of entries) {
      const caps = new Set(deriveCapabilities(model));
      const modalities = model.modalities?.input;
      for (const [capability, modality] of Object.entries(evidence)) {
        if (!caps.has(capability)) continue;
        if (!Array.isArray(modalities)) continue; // no detail available; fallback path applied
        if (!modalities.includes(modality)) offenders.push(`${model.id}:${capability}`);
      }
    }
    assert.equal(
      offenders.length,
      0,
      `${offenders.length} capability grants contradict modalities.input, e.g. ${offenders.slice(0, 5).join(", ")}`
    );
  });

  check("corpus: every modality in the payload is mapped", () => {
    const mapped = new Set(["image", "audio", "video", "pdf", "document", "file"]);
    const seen = new Set();
    for (const model of entries) {
      for (const modality of model.modalities?.input ?? []) seen.add(modality);
    }
    const unmapped = [...seen].filter((m) => !mapped.has(m) && m !== "text");
    assert.deepEqual(unmapped, [], `unmapped input modalities would silently grant nothing`);
  });

  //
  // Schema coverage. `ModelsDevModel` is a hand-written shape, so an optional field we forgot
  // is NOT a compile error -- nothing points at metadata we never read. The real payload is the
  // only authority on what the upstream schema emits, so it decides: any key present in the
  // cache but missing from the declared shape (or from the exported key list) fails here.
  //
  // This is what would have caught `interleaved` (present in 7842 entries, absent from the type).
  //
  check("corpus: every payload model field is declared in ModelsDevModel", () => {
    const declared = new Set(MODELS_DEV_MODEL_FIELDS);
    const undeclared = new Set();
    for (const model of entries) {
      for (const key of Object.keys(model)) {
        if (!declared.has(key)) undeclared.add(key);
      }
    }
    assert.deepEqual(
      [...undeclared].sort(),
      [],
      `models.dev emits field(s) ModelsDevModel does not declare — add them (plus the key list) ` +
        `so the shape stays honest about metadata we are ignoring`
    );
  });

  check("corpus: every payload cost field is declared in ModelsDevCost", () => {
    const declared = new Set(MODELS_DEV_COST_FIELDS);
    const undeclared = new Set();
    for (const model of entries) {
      for (const key of Object.keys(model.cost ?? {})) {
        if (!declared.has(key)) undeclared.add(key);
      }
    }
    assert.deepEqual([...undeclared].sort(), [], `models.dev emits cost field(s) not declared in ModelsDevCost`);
  });
}

// ============================================================================

console.log("");
if (errors.length > 0) {
  console.error(`model-capabilities validation FAILED (${errors.length} check(s))`);
  for (const e of errors) console.error(`  - ${e.name}: ${e.err?.message ?? e.err}`);
  process.exit(1);
}
console.log("model-capabilities validation passed");
