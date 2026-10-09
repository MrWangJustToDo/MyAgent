/**
 * Child process for `validate-extension-flush.mjs` section 10.
 *
 * It exists because the property under test can only be observed on a real process exit:
 * `installAgentLogProcessGuards()` registers `process.on("exit")`, and installing it in the
 * validator itself would make that process call `process.exit`. So the wiring is exercised here,
 * in a process whose only job is to leave the buffer unfinished and exit normally.
 *
 * Usage: node exit-wiring-child.mjs <rootPath> <logDir>
 */

import fs from "node:fs";
import path from "node:path";

import {
  AgentLog,
  clearCoreEnv,
  createLogExtension,
  installAgentLogProcessGuards,
  registerCoreEnv,
} from "../../dist/dev.mjs";

const [rootPath, logDir] = process.argv.slice(2);
const toAbs = (p) => (path.isAbsolute(p) ? p : path.join(rootPath, p));

clearCoreEnv();
registerCoreEnv({
  rootPath,
  path: {
    join: (...p) => p.join("/"),
    dirname: (p) => p.split("/").slice(0, -1).join("/") || "/",
    isAbsolute: path.isAbsolute,
    normalize: path.normalize,
    relative: path.relative,
    resolve: (...p) => path.resolve(...p),
  },
  getPlatform: async () => "linux",
  getArch: async () => "x64",
  getEnv: async () => ({}),
  homedir: async () => rootPath,
  fs: {
    readFile: async (p, encoding) => fs.promises.readFile(toAbs(p), encoding),
    writeFile: async (p, content) => fs.promises.writeFile(toAbs(p), content),
    appendFile: async (p, content) => fs.promises.appendFile(toAbs(p), content, "utf8"),
    appendFileSync: (p, content) => fs.appendFileSync(toAbs(p), content, "utf8"),
    mkdir: async (p) => void (await fs.promises.mkdir(toAbs(p), { recursive: true })),
    mkdirSync: (p) => fs.mkdirSync(toAbs(p), { recursive: true }),
    exists: async (p) =>
      fs.promises.access(toAbs(p)).then(
        () => true,
        () => false
      ),
    existsSync: (p) => fs.existsSync(toAbs(p)),
    stat: async (p) => {
      const st = await fs.promises.stat(toAbs(p));
      return { isDirectory: st.isDirectory(), isFile: st.isFile(), size: st.size, mtime: st.mtime };
    },
    remove: async (p) => fs.promises.rm(toAbs(p), { recursive: true, force: true }),
    readdir: async () => [],
  },
  runCommand: async () => ({ stdout: "", stderr: "", code: 0 }),
  exec: async () => ({ stdout: "", stderr: "", code: 0 }),
  fetch: async () => new Response(),
});

installAgentLogProcessGuards();

const ext = createLogExtension({ resolveLog: () => null });
const log = new AgentLog();
// A long interval: no timer can fire before this process exits, so only the exit hook can land it.
ext.attachSink(log, { dir: logDir, filename: "agent.log", flushIntervalMs: 10_000 });
ext.start();

log.info("system", "written-on-real-exit");

// Must be a *hard* exit. A plain `return` would leave the sink's flush timer pending, so the
// process would exit only after `flushIntervalMs` — and the async timer path would write the entry
// on its own, letting the wiring be deleted without failing anything. `process.exit` is the moment
// the exit hook is the *only* thing that can still write.
process.exit(0);
