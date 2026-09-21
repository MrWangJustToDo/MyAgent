/**
 * Validate that the Node adapter reports the real outcome of a spawn.
 *
 * Why this exists: the err branch collapsed five different situations into a single exit code
 * (127). Node distinguishes them, so folding them together destroyed information the callers
 * need — and two of the collapses produced wrong behaviour, not just less detail:
 *
 *   exit 1 / exit 2      -> the process ran and failed; its real status matters
 *   exit 127             -> a legitimate status (a shell script's "command not found")
 *   timeout              -> the child was killed; there is no exit status at all
 *   ENOENT / EACCES      -> the binary could not be launched
 *
 * In particular a timeout was reported as 127, which the search tools interpret as "binary is
 * missing" — so a killed search looked like an absent binary, and (before the companion fix in
 * exec-args) as a successful empty result.
 *
 * Runs anywhere: the successful-exit cases are driven through `node` itself (a fake shell string
 * would need `/bin/sh`, which does not exist on Windows), and a non-existent path for the
 * spawn failure, so no platform-specific binary is required.
 */

import { createNodeEnv } from "../dist/index.mjs";

let failures = 0;
function check(label, condition, detail = "") {
  if (condition) console.log(`PASS  ${label}`);
  else {
    failures += 1;
    console.log(`FAIL  ${label}${detail ? `\n      ${detail}` : ""}`);
  }
}

const env = createNodeEnv({ rootPath: process.cwd() });
// `process.execPath` with `-e` rather than `/bin/sh -c`: the semantics under test are exit-code
// reporting, stdout capture and timeout handling, none of which need a shell — and `/bin/sh` is
// POSIX-only, so a shell-based version of this test cannot run on Windows at all.
const SHELL_ARGS = (script) => ["-e", script];

// ---------------------------------------------------------------------------
// real exit codes survive
// ---------------------------------------------------------------------------

for (const code of [1, 2, 127]) {
  const result = await env.execFile(process.execPath, SHELL_ARGS(`console.log("output"); process.exit(${code})`), {
    timeout: 5000,
  });
  check(
    `exit ${code} is reported as ${code} (not collapsed)`,
    result.code === code,
    `code=${JSON.stringify(result.code)} stdout=${JSON.stringify(result.stdout)}`
  );
  check(`exit ${code} keeps its stdout`, result.stdout.includes("output"), `stdout=${JSON.stringify(result.stdout)}`);
}

// A clean exit is still 0.
const ok = await env.execFile(process.execPath, SHELL_ARGS('console.log("fine")'), { timeout: 5000 });
check("exit 0 is reported as 0", ok.code === 0, JSON.stringify(ok));

// ---------------------------------------------------------------------------
// a killed child is distinguishable from a process that exited
// ---------------------------------------------------------------------------

const timedOut = await env.execFile(process.execPath, SHELL_ARGS("setTimeout(() => {}, 5000)"), { timeout: 150 });
check(
  "a timeout does not masquerade as a real exit code",
  timedOut.code === null || timedOut.code === "timeout",
  `code=${JSON.stringify(timedOut.code)} (a number would let it be read as that status)`
);
check("a timeout reports that it was killed", timedOut.killed === true, JSON.stringify(timedOut));

// ---------------------------------------------------------------------------
// a missing binary is reported as missing, not as a status
// ---------------------------------------------------------------------------

const enoent = await env.execFile("/nonexistent/binary-xyz", [], { timeout: 5000 });
check("ENOENT reports a missing binary", enoent.missing === true, JSON.stringify(enoent));
check(
  "ENOENT does not claim a process exit status",
  enoent.code === null || typeof enoent.code === "string",
  `code=${JSON.stringify(enoent.code)}`
);

console.log(
  failures === 0 ? "\nvalidate-exec-file-status: ok" : `\nvalidate-exec-file-status FAILED (${failures} case(s))`
);
process.exit(failures === 0 ? 0 : 1);
