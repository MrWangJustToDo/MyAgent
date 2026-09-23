/**
 * Merge semantics for a mid-session `/settings config` save.
 *
 * The wizard writes a whole models.json shape, but a re-edit must not throw away
 * what it cannot express: other entries, `global`, the position/selection of the
 * entry being edited, and — the case that shipped broken — **every key the schema
 * does not declare** (`$schema`, a hand-written `headers`, a future `global`
 * setting). Those live on the raw document; validating it first strips them, so
 * the save used to delete them silently while reporting success.
 *
 * Run: node packages/app/test/merge-models-config.test.mjs
 */
import assert from "node:assert/strict";

import { mergeModelsConfig } from "../dist/index.mjs";

const direct = (over) => ({ type: "direct", style: "openai", baseURL: "https://a/v1", models: ["m1"], ...over });

const draft = (over = {}) => ({
  models: [direct({ baseURL: "https://new/v1", apiKey: "sk-new", models: ["m1", "m2"], ...over })],
});

// ---------------------------------------------------------------------------
// 1. No existing file (first-run shape): the draft IS the file
// ---------------------------------------------------------------------------
{
  const merged = mergeModelsConfig(null, draft());
  assert.equal(merged.models.length, 1);
  assert.equal(merged.models[0].baseURL, "https://new/v1");
  assert.deepEqual(merged.active, { entryIndex: 0, model: "m1" });
  assert.equal(merged.global, undefined);
}

// ---------------------------------------------------------------------------
// 2. Re-edit keeps other entries and global, replaces only the active one
// ---------------------------------------------------------------------------
{
  const existing = {
    global: { maxIterations: 30, toolConfig: { braveApiKey: "sk-brave" } },
    models: [direct({ baseURL: "https://old/v1" }), { type: "remote-provider", url: "http://localhost:3100" }],
    active: { entryIndex: 0, model: "m1" },
  };

  const merged = mergeModelsConfig(existing, draft());

  assert.equal(merged.models.length, 2, "entry count preserved");
  assert.equal(merged.models[0].baseURL, "https://new/v1", "edited entry replaced");
  assert.deepEqual(merged.models[1], { type: "remote-provider", url: "http://localhost:3100" }, "sibling kept");
  assert.deepEqual(merged.global, existing.global, "global kept");
  assert.equal(merged.active.entryIndex, 0);
  assert.equal(merged.active.model, "m1", "still-offered model kept");

  // Input was not mutated.
  assert.equal(existing.models[0].baseURL, "https://old/v1");
}

// ---------------------------------------------------------------------------
// 3. The active entry keeps its identity even when it is not index 0
// ---------------------------------------------------------------------------
{
  const existing = {
    models: [direct({ baseURL: "https://a/v1" }), direct({ baseURL: "https://b/v1" })],
    active: { entryIndex: 1, model: "m1" },
  };
  const merged = mergeModelsConfig(existing, draft());
  assert.equal(merged.models[0].baseURL, "https://a/v1", "index 0 untouched");
  assert.equal(merged.models[1].baseURL, "https://new/v1", "active entry edited in place");
  assert.equal(merged.active.entryIndex, 1);
}

// ---------------------------------------------------------------------------
// 4. A selection the new entry no longer offers falls back to its first id
// ---------------------------------------------------------------------------
{
  const existing = { models: [direct({})], active: { entryIndex: 0, model: "dropped" } };
  const merged = mergeModelsConfig(existing, draft({ models: ["m2", "m3"] }));
  assert.equal(merged.active.model, "m2", "falls back to the first offered id");
}

// ---------------------------------------------------------------------------
// 5. Out-of-range entry index appends
// ---------------------------------------------------------------------------
{
  const existing = { models: [direct({})], active: { entryIndex: 0 } };
  const merged = mergeModelsConfig(existing, draft(), { entryIndex: 5 });
  assert.equal(merged.models.length, 2);
  assert.equal(merged.active.entryIndex, 1, "appended at the end");
}

// ---------------------------------------------------------------------------
// 6. A draft with no models is a no-op, never a schema-invalid write
// ---------------------------------------------------------------------------
{
  const existing = { models: [direct({})], active: { entryIndex: 0 } };
  const merged = mergeModelsConfig(existing, { models: [] });
  assert.deepEqual(merged, existing);
}

// ---------------------------------------------------------------------------
// 7. A remote-provider entry can be replaced by a direct one (the wizard cannot
//    express a remote entry, so an edit of one produces a direct connection)
// ---------------------------------------------------------------------------
{
  const existing = {
    models: [{ type: "remote-provider", url: "http://localhost:3100" }],
    active: { entryIndex: 0 },
  };
  const merged = mergeModelsConfig(existing, draft());
  assert.equal(merged.models[0].type, "direct");
  assert.equal(merged.active.entryIndex, 0);
  assert.equal(merged.models[0].url, undefined, "the replaced form's own key is dropped, not carried");
}

// ---------------------------------------------------------------------------
// 8. Unknown keys survive a round trip (the shipped data-loss bug)
// ---------------------------------------------------------------------------
{
  const existing = {
    $schema: "https://example.com/models.schema.json",
    global: { maxIterations: 25, futureSetting: "keep-me", toolConfig: { braveApiKey: "sk-brave" } },
    models: [
      direct({ baseURL: "https://old/v1", headers: { "X-Custom": "keep-me" }, label: "my-own-field" }),
      direct({ baseURL: "https://sib/v1", headers: { "X-Sib": "keep" } }),
    ],
    active: { entryIndex: 0, model: "m1" },
  };

  const merged = mergeModelsConfig(existing, draft({ baseURL: "https://new/v1", apiKey: "sk-new" }));

  assert.equal(merged.$schema, existing.$schema, "top-level unknown key preserved");
  assert.equal(merged.global.futureSetting, "keep-me", "global unknown key preserved");
  assert.deepEqual(merged.global.toolConfig, { braveApiKey: "sk-brave" }, "global known keys preserved");
  assert.deepEqual(merged.models[1].headers, { "X-Sib": "keep" }, "an untouched entry keeps its unknown keys");
  assert.deepEqual(
    merged.models[0].headers,
    { "X-Custom": "keep-me" },
    "the edited entry keeps its unknown keys too — only the wizard's fields are replaced"
  );
  assert.equal(merged.models[0].label, "my-own-field", "an arbitrary entry key is not a wizard field");
  assert.equal(merged.models[0].baseURL, "https://new/v1", "the wizard's field was applied");
  assert.equal(merged.models[0].apiKey, "sk-new");

  // A field the wizard *removed* must really go away (spread would keep it).
  const cleared = mergeModelsConfig(existing, draft({ apiKey: undefined }));
  assert.equal(cleared.models[0].apiKey, undefined, "a cleared wizard field is deleted, not kept");
}

console.log("merge-models-config: ok");
