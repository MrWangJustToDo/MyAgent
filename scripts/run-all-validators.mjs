/**
 * Validator suite runner — one package's `scripts/validate-*.mjs`, against the build
 * that is already on disk.
 *
 * Why a runner instead of `pnpm run validate:*` per script: **151 of the 156** core
 * `validate:*` entries embed `pnpm run build &&`, so driving them through npm pays a
 * 3.2 s rebuild per validator (151 × 3.2 s ≈ 483 s). The files themselves take 34 s for
 * the whole core suite. The expense is an artifact of how the scripts are written, not
 * of what they test — so this runs the files directly with `node` and leaves those
 * definitions untouched (each still builds correctly when run standalone).
 *
 * Discovery is a **glob, not a list**. A new `validate-*.mjs` is covered by existing, and
 * a script with no `validate:*` npm entry still runs — which is how
 * `validate-format-read-file-result.mjs` had gone unrun while looking like coverage.
 *
 * Two behaviours exist to keep a green run honest:
 *
 * - **Skipped is not passed.** A validator whose prerequisite is missing exits 0, which is
 *   indistinguishable from a validator that verified everything. Skipping is signalled
 *   explicitly ({@link SKIP_MARKER}) and reported separately. Without this, a Windows run
 *   where every language-server validator silently skipped would read as a full pass.
 * - **Untracked paths are a failure.** A validator reading the repo's gitignored `.agents/`
 *   passes only on a machine where that directory happens to be populated, and fails on a
 *   fresh clone — i.e. in CI and only in CI. That is a real incident, not a hypothetical.
 *
 * Usage (root is the workspace root; run from anywhere):
 *   node scripts/run-all-validators.mjs [--dir packages/core] [--concurrency N] [--timeout-ms N] [--quiet]
 *
 *   --dir <path>   run one package's validators (repeatable); default is every package
 *   --quiet        suppress the per-validator `ok` lines (summaries and skips still print)
 *
 * The guard helpers are exported so they can be unit-tested without running the suite.
 */

import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ============================================================================
// Contract with the validators
// ============================================================================

/**
 * Printed by a validator that is skipping work rather than verifying it. Any validator
 * that cannot exercise its assertions MUST print this, so the suite reports a skip
 * instead of counting an `exit 0` as a pass.
 */
export const SKIP_MARKER = "[validator-skip]";

/** Emit a skip notice in the shared format. */
export function reportSkip(reason) {
  console.log(`${SKIP_MARKER} ${reason}`);
}

// ============================================================================
// Config
// ============================================================================

const DEFAULT_TIMEOUT_MS = 90_000;
// Memory is the binding constraint, not CPU: the core build peaks at ~4 GB and runners
// carry ~8 GB, so a deeper window risks an OOM kill that looks like a validator failure.
const DEFAULT_CONCURRENCY = 4;

function parseArgs(argv) {
  const opts = { dirs: [], concurrency: DEFAULT_CONCURRENCY, timeoutMs: DEFAULT_TIMEOUT_MS, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dir") opts.dirs.push(argv[++i]);
    else if (arg === "--concurrency") opts.concurrency = Number(argv[++i]);
    else if (arg === "--timeout-ms") opts.timeoutMs = Number(argv[++i]);
    else if (arg === "--quiet") opts.quiet = true;
  }
  return opts;
}

// ============================================================================
// Untracked-path guard
// ============================================================================

/**
 * Paths a validator must never read from the repository: gitignored runtime state.
 *
 * `.agents/` is where the agent writes logs, sessions, plans and memory — and where a
 * developer's own skills live. It is covered by a `.gitignore` entry, so it is absent on
 * a fresh clone.
 */
const UNTRACKED_REPO_PREFIXES = [".agents/", "tmp/"];

/**
 * True for expressions that resolve against the repository checkout rather than a temp dir.
 *
 * This is what makes the guard precise. `join(rootPath, ".agents", ...)` is *not* a bug when
 * `rootPath` is a `mkdtemp` directory — and several validators do exactly that, legitimately.
 * The repository root has a specific signature: it comes from the module URL (`import.meta.url`)
 * or is walked up from the script directory. A temp root comes from `mkdtemp`/`tmpdir`.
 */
const REPO_ROOT_EXPR =
  /import\.meta\.url|fileURLToPath|__dirname|process\.cwd\(\)|\.\.\/\s*\.\.\/|\.\.\s*,\s*import\.meta/;

/**
 * Identifiers bound to an expression that resolves against the repository checkout.
 *
 * Empty for a validator that only builds temp fixtures, which is why a violation here is a
 * positive signal rather than a heuristic.
 */
export function repoRootIdentifiers(source) {
  const names = new Set();
  for (const line of source.split("\n")) {
    if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;
    // `const root = fileURLToPath(new URL("../../..", import.meta.url))`
    // `const ROOT = new URL("..", import.meta.url).pathname`
    const decl = line.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;]+);?/);
    if (!decl) continue;
    const [, name, expr] = decl;
    if (REPO_ROOT_EXPR.test(expr)) names.add(name);
  }
  return names;
}

/**
 * Whether a validator actually *reads* a repo-relative untracked path.
 *
 * Deliberately conservative, because a guard that cries wolf gets switched off. A bare
 * mention is not a bug — three validators legitimately carry `.agents/...` as an opaque
 * string value (asserting a returned `planSave.data.path`). The signal is a path built from
 * an identifier that {@link repoRootIdentifiers} proved resolves to the repository root.
 */
export function readsUntrackedRepoPath(source) {
  const repoRoots = repoRootIdentifiers(source);
  if (repoRoots.size === 0) return null;

  for (const rawLine of source.split("\n")) {
    const line = rawLine.trim();
    // Comments and docs describe the pattern without performing the read.
    if (line.startsWith("*") || line.startsWith("//") || line.startsWith("/*")) continue;

    for (const prefix of UNTRACKED_REPO_PREFIXES) {
      const segment = prefix.replace(/\/$/, "");
      for (const name of repoRoots) {
        // join/resolve(root, ".agents", ...) — with the id matching a repo-root binding.
        const joined = new RegExp(`(?:join|resolve)\\s*\\(\\s*${name}\\s*,\\s*["'\`]${segment}["'\`]`);
        // `${root}/.agents/` inside a template literal.
        const interpolated = new RegExp(`\\$\\{\\s*${name}\\s*\\}[\\/\\\\]${segment}[\\/\\\\]`);
        if (joined.test(line) || interpolated.test(line)) return prefix;
      }
    }
  }
  return null;
}

// ============================================================================
// Running a package's validators
// ============================================================================

function runOne(file, scriptsDir, timeoutMs) {
  const start = Date.now();
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [join(scriptsDir, file)], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
      cwd: dirname(scriptsDir),
    });

    let output = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));

    child.on("close", (code) => {
      clearTimeout(timer);
      const ms = Date.now() - start;
      const skipped = output.includes(SKIP_MARKER);
      let status;
      if (timedOut) status = "timeout";
      else if (code !== 0) status = "fail";
      else if (skipped) status = "skip";
      else status = "pass";
      resolvePromise({ file, status, ms, output, code });
    });
  });
}

// ============================================================================
// Report
// ============================================================================

function fmtMs(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function tail(text, lines = 12) {
  return text.split("\n").filter(Boolean).slice(-lines).join("\n");
}

/**
 * Run every `validate-*.mjs` in one package's `scripts/` directory.
 *
 * Returns counts so the dispatcher can aggregate; the per-package report is printed here,
 * next to the results it describes.
 */
async function runPackageValidators({ scriptsDir, concurrency, timeoutMs, quiet }) {
  const packageRoot = resolve(scriptsDir, "..");
  const packageName = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")).name;

  const files = (await readdir(scriptsDir))
    .filter((name) => name.startsWith("validate-") && name.endsWith(".mjs"))
    .sort();

  const summary = { passed: 0, failed: 0, skipped: 0, timeout: 0, guardViolations: [] };

  if (files.length === 0) {
    return summary;
  }

  // Guard: reject before running, so a violation is attributed to the source rather than
  // surfacing as a confusing runtime failure on a fresh clone.
  for (const file of files) {
    const source = await readFile(join(scriptsDir, file), "utf8");
    const prefix = readsUntrackedRepoPath(source);
    if (prefix) summary.guardViolations.push({ file, prefix });
  }

  const results = [];
  let next = 0;

  async function worker() {
    while (next < files.length) {
      const file = files[next++];
      const result = await runOne(file, scriptsDir, timeoutMs);
      results.push(result);
      if (!quiet) {
        const label = { pass: "ok  ", fail: "FAIL", skip: "SKIP", timeout: "TIME" }[result.status];
        console.log(`${label} ${fmtMs(result.ms).padStart(7)}  ${file}`);
      }
    }
  }

  const startedAt = Date.now();
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
  const wall = Date.now() - startedAt;

  const passed = results.filter((r) => r.status === "pass");
  const failed = results.filter((r) => r.status === "fail");
  const timedOut = results.filter((r) => r.status === "timeout");
  const skipped = results.filter((r) => r.status === "skip");

  summary.passed = passed.length;
  summary.failed = failed.length;
  summary.skipped = skipped.length;
  summary.timeout = timedOut.length;

  console.log(`\n${"=".repeat(72)}`);
  console.log(`[validators] ${packageName} (${files.length} scripts, ${fmtMs(wall)}, concurrency ${concurrency})`);
  console.log(`[validators]   passed:  ${passed.length}`);
  console.log(`[validators]   failed:  ${failed.length}`);
  console.log(`[validators]   skipped: ${skipped.length}`);
  console.log(`[validators]   timeout: ${timedOut.length}`);

  for (const r of skipped) {
    const reason = r.output.split("\n").find((l) => l.includes(SKIP_MARKER)) ?? "";
    console.log(`[validators]   SKIP ${r.file}: ${reason.replace(SKIP_MARKER, "").trim()}`);
  }

  for (const r of [...failed, ...timedOut]) {
    console.log(`\n${"-".repeat(72)}`);
    console.log(`[validators] ${r.status.toUpperCase()}: ${r.file}`);
    console.log(tail(r.output));
  }

  // A validator that reads a gitignored path passes locally and fails in CI. Report it as a
  // failure of this suite, attributed to the source, so it is fixed before it reaches CI.
  if (summary.guardViolations.length > 0) {
    console.log(`\n${"-".repeat(72)}`);
    console.log(`[validators] FAILED: validator(s) read a repository path git does not track`);
    for (const v of summary.guardViolations) {
      console.log(
        `[validators]   ${v.file} reads "${v.prefix}" relative to the repo — absent on a fresh clone.\n` +
          `[validators]   Build the fixture at run time (os.tmpdir()) instead.`
      );
    }
  }

  return summary;
}

// ============================================================================
// Dispatcher
// ============================================================================

/**
 * Packages whose validators are deliberately NOT run by this suite.
 *
 * `packages/codent`'s two validators assert the *published tarball* contract
 * (`validate:self-contained`, `validate:runtime-specifiers`). CI runs them at a specific
 * point — after `build:app:release` — because what they check depends on which app build the
 * bundle consumed. Running them here as well would either duplicate that gate or, worse,
 * assert it against the wrong build and fail for a reason that is not a regression.
 */
const SUITE_EXCLUDED_PACKAGES = new Set(["codent"]);

/**
 * Every workspace package that has a `scripts/` directory. Discovered rather than listed,
 * for the same reason the validators are: a new package is covered by existing.
 */
async function discoverPackageDirs(workspaceRoot) {
  const packagesDir = join(workspaceRoot, "packages");
  const dirs = [];
  for (const entry of await readdir(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || SUITE_EXCLUDED_PACKAGES.has(entry.name)) continue;
    const scripts = join(packagesDir, entry.name, "scripts");
    try {
      const files = await readdir(scripts);
      if (files.some((f) => f.startsWith("validate-") && f.endsWith(".mjs"))) dirs.push(scripts);
    } catch {
      // No scripts/ directory — not a validator-carrying package.
    }
  }
  return dirs.sort();
}

async function main() {
  const { dirs, concurrency, timeoutMs, quiet } = parseArgs(process.argv.slice(2));
  const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

  // `--dir` names a *package* directory (`packages/core`) for readability; the runner works
  // on the `scripts/` directory inside it. Accept either form.
  const targets =
    dirs.length > 0
      ? dirs.map((d) => {
          const abs = resolve(workspaceRoot, d);
          return abs.endsWith("scripts") ? abs : join(abs, "scripts");
        })
      : await discoverPackageDirs(workspaceRoot);

  if (targets.length === 0) {
    console.log("[validators] no package scripts directories found");
    process.exit(0);
  }

  let anyBad = false;
  const grand = { passed: 0, failed: 0, skipped: 0, timeout: 0 };

  for (const scriptsDir of targets) {
    const summary = await runPackageValidators({ scriptsDir, concurrency, timeoutMs, quiet });
    grand.passed += summary.passed;
    grand.failed += summary.failed;
    grand.skipped += summary.skipped;
    grand.timeout += summary.timeout;
    if (summary.passed + summary.failed + summary.skipped + summary.timeout === 0) continue;
    if (summary.failed + summary.timeout + summary.guardViolations.length > 0) anyBad = true;
  }

  console.log(`\n${"=".repeat(72)}`);
  console.log(
    `[validators] ALL PACKAGES: ${grand.passed} passed, ${grand.failed} failed, ` +
      `${grand.skipped} skipped, ${grand.timeout} timeout`
  );
  process.exit(anyBad ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
