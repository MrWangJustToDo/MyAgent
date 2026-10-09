/**
 * Orchestrates the workspace panel's refresh check.
 *
 * The check itself is `workspace-refresh-check/run.mjs`, which drives the REAL `WorkspaceFileMode`
 * in a fake terminal. This file is the way in, and it exists for two reasons:
 *
 *   - **Opt-in.** The subject is the panel's 10s timer, so a run costs ~40s of real waiting against
 *     the suite's ~34s core budget, and it is the only check that renders the TUI. Unset
 *     `WATCH_WORKSPACE_REFRESH=1` reports a SKIP (the runner prints skips separately — an `exit 0`
 *     would be counted as a pass and claim the behaviour was verified, which is exactly what
 *     `scripts/run-all-validators.mjs` refuses to do). CI sets it, so the check does run per PR.
 *   - **One module graph.** `run.mjs` imports the panel AND the stores it renders from a single
 *     bundle, so both read the same store instances. Building that bundle here (rather than importing
 *     `src` through several entries) is what makes the assertions meaningful.
 *
 * Run: WATCH_WORKSPACE_REFRESH=1 pnpm --filter @codent/app run validate:workspace-refresh
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const checkDir = join(here, "workspace-refresh-check");

if (process.env.WATCH_WORKSPACE_REFRESH !== "1") {
  console.log(
    "[validator-skip] set WATCH_WORKSPACE_REFRESH=1 to run — the check waits out the panel's real 10s refresh timer (~40s)"
  );
  process.exit(0);
}

// Resolve tsdown through Node instead of a shell alias: the suite spawns this file directly with
// `node`, so a PATH lookup is not guaranteed to find a `.bin` shim.
const tsdownBin = join(dirname(require.resolve("tsdown/package.json")), "dist", "run.mjs");

const built = spawnSync(process.execPath, [tsdownBin, "--config", join(checkDir, "tsdown.config.ts")], {
  cwd: resolve(here, ".."),
  stdio: ["ignore", "pipe", "pipe"],
  encoding: "utf8",
});

if (built.status !== 0) {
  console.error(built.stdout ?? "");
  console.error(built.stderr ?? "");
  console.error("workspace refresh check FAILED: could not bundle the panel");
  process.exit(1);
}

const ran = spawnSync(process.execPath, [join(checkDir, "run.mjs")], {
  cwd: resolve(here, ".."),
  stdio: "inherit",
});

process.exit(ran.status ?? 1);
