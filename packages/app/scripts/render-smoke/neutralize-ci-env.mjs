/**
 * MUST stay the first import in `run.mjs` — before the renderer and before anything that
 * imports `./dist/*`.
 *
 * ESM evaluates static imports depth-first in declaration order, so this module's body runs
 * before the rest of the graph. That ordering is the whole mechanism: the terminal renderer
 * reads `CI` / `CONTINUOUS_INTEGRATION` through `is-in-ci`, which captures the value at MODULE
 * LOAD, and the renderer branches on it per frame — `renderCi()` when true. The CI mode exists
 * for real terminals ("CIs don't handle erasing ansi escapes well") and writes each frame
 * WITHOUT the erase/repaint sequences. `frameLines()` reconstructs the current frame by slicing
 * at the last erase block, so under CI mode every frame reads as empty and a dozen unrelated
 * frame assertions fail with `frameLines: 0` — the failure looks like broken checks, not like
 * an environment mismatch.
 *
 * This smoke asserts on frames by design, so it needs the repaint path unconditionally. CI
 * added these variables itself (GitHub Actions exports `CI=true`), not the user, and nothing
 * here spawns a child that could want them — deleting them is scoped to this process.
 */
for (const key of ["CI", "CONTINUOUS_INTEGRATION"]) {
  delete process.env[key];
}
