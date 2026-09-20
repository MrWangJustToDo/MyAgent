/**
 * Validate shell-agnostic bare-command resolution.
 *
 * Why this exists: `CoreEnv.commandExists` probed with `command -v "<cmd>" >/dev/null 2>&1`.
 * That is a POSIX shell builtin, so on Windows it reported every binary as missing — the LSP
 * extension skipped installed language servers and the search tools' fallback logic could
 * never engage. The replacement scans `PATH` directly.
 *
 * The Windows paths are the whole point of the change, so they are asserted explicitly here
 * rather than left to a Windows runner: `scanPathForCommand` takes `isWindows` and `exists`
 * as inputs, which means these cases are testable on Linux. A platform branch that only ever
 * executes on Windows is a branch that never runs in CI.
 */

import { commandFileCandidates, pathDirs, scanPathForCommand } from "../dist/index.mjs";

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) {
    console.log(`      expected ${JSON.stringify(expected)}`);
    console.log(`      actual   ${JSON.stringify(actual)}`);
  }
}

// --- PATHEXT handling -------------------------------------------------------
check("posix: no extension appended", commandFileCandidates("rg", false, undefined), ["rg"]);

const win = commandFileCandidates("rg", true, ".COM;.EXE;.BAT;.CMD");
check("win32: exact name tried first", win.slice(0, 3), ["rg", "rg.com", "rg.COM"]);
check("win32: .cmd shim resolvable", commandFileCandidates("pnpm", true, ".EXE;.CMD").includes("pnpm.cmd"), true);
check("win32: .bat resolvable", commandFileCandidates("gradlew", true, ".BAT").includes("gradlew.bat"), true);
check("win32: default PATHEXT when unset", commandFileCandidates("x", true, undefined).includes("x.exe"), true);

// --- PATH splitting ---------------------------------------------------------
check("win32: semicolon-separated PATH", pathDirs({ PATH: "C:\\a;C:\\b" }, true), ["C:\\a", "C:\\b"]);
check("posix: colon-separated PATH", pathDirs({ PATH: "/a:/b" }, false), ["/a", "/b"]);
check("win32: `Path` spelling accepted", pathDirs({ Path: "C:\\a" }, true), ["C:\\a"]);

// --- resolution -------------------------------------------------------------
const present = new Set(["C:\\tools\\rg.exe", "C:\\other\\rg.exe", "C:\\Program Files\\Git\\bin\\bash", "/usr/bin/rg"]);
const exists = (p) => present.has(p);
// The POSIX cases below inject `exists`, so they must inject the executability check too —
// otherwise the default `X_OK` probe runs against paths that only exist in this fixture and
// every case fails. Real POSIX executability is covered by the dedicated block further down.
const alwaysExecutable = () => true;
const onWindows = (pathValue) => ({
  env: { PATH: pathValue },
  isWindows: true,
  exists,
  isExecutable: alwaysExecutable,
});

// First match wins, mirroring shell lookup order.
check("win32: first PATH entry wins", scanPathForCommand("rg", onWindows("C:\\tools;C:\\other")), "C:\\tools\\rg.exe");
// An extensionless binary still resolves — Git Bash ships `bash` that way.
check(
  "win32: extensionless binary resolves",
  scanPathForCommand("bash", onWindows("C:\\Program Files\\Git\\bin")),
  "C:\\Program Files\\Git\\bin\\bash"
);
// A bare name must NOT resolve on Windows: only the .exe variant exists.
check(
  "win32: bare name with no matching extension does not resolve",
  scanPathForCommand("git", onWindows("C:\\Program Files\\Git\\bin")),
  undefined
);
check("win32: absent command returns undefined", scanPathForCommand("nope", onWindows("C:\\tools")), undefined);

// Path-shaped arguments are verified as given, not PATH-searched.
check(
  "path-shaped argument verified as given",
  scanPathForCommand("C:\\tools\\rg.exe", onWindows("")),
  "C:\\tools\\rg.exe"
);
check("path-shaped argument rejected when absent", scanPathForCommand("C:\\missing\\rg.exe", onWindows("")), undefined);

// POSIX behaviour is unchanged.
check(
  "posix: resolves against colon PATH",
  scanPathForCommand("rg", {
    env: { PATH: "/usr/bin:/bin" },
    isWindows: false,
    exists,
    isExecutable: alwaysExecutable,
  }),
  "/usr/bin/rg"
);

// ---------------------------------------------------------------------------
// executability
//
// Existing is not enough. A file on PATH without the execute bit cannot be spawned, so
// reporting it as available defers the failure to the spawn site — for the LSP path that is a
// server which looks installed and then dies.
// ---------------------------------------------------------------------------

const EXISTS = new Set(["/opt/bin/nonexec", "/opt/bin/realbin", "/opt/bin/where.exe", "C:\\bin\\where.exe"]);
const execMask = new Set(["/opt/bin/realbin", "/opt/bin/where.exe", "C:\\bin\\where.exe"]);
const existsOnly = (p) => EXISTS.has(p);
const isExecutable = (p) => execMask.has(p);

check(
  "posix: a non-executable file in PATH is NOT reported as available",
  scanPathForCommand("nonexec", {
    env: { PATH: "/opt/bin" },
    isWindows: false,
    exists: existsOnly,
    isExecutable,
  }),
  undefined
);
check(
  "posix: an executable file in PATH is reported as available",
  scanPathForCommand("realbin", {
    env: { PATH: "/opt/bin" },
    isWindows: false,
    exists: existsOnly,
    isExecutable,
  }),
  "/opt/bin/realbin"
);
check(
  "posix: an absolute path must also be executable",
  scanPathForCommand("/opt/bin/nonexec", { isWindows: false, exists: existsOnly, isExecutable }),
  undefined
);

// Windows has no execute bit; a name that survived PATHEXT expansion is taken as executable, and
// the injected `isExecutable: () => true` models that. What matters is that the default does not
// reject every Windows hit.
check(
  "windows: a PATHEXT-resolved name is reported as available",
  scanPathForCommand("where", {
    env: { PATH: "C:\\bin", PATHEXT: ".EXE;.CMD" },
    isWindows: true,
    exists: existsOnly,
    isExecutable: () => true,
  }),
  "C:\\bin\\where.exe"
);

if (failures > 0) {
  console.error(`\nvalidate:command-lookup FAILED (${failures} case(s))`);
  process.exit(1);
}
console.log("\nvalidate-command-lookup: ok");
