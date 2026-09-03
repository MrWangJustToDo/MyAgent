/**
 * Validation: built-in Code Mode extension.
 *
 * Verifies the two activation paths:
 * 1. When the host provides a `createIsolateDriver` (via CoreEnv), the extension
 *    registers `execute_typescript` (+ `discover_tools`) and contributes a
 *    non-empty code-mode guidance through `registerContextProvider({ content })`.
 * 2. When the driver is absent/null, the extension degrades gracefully: it warns
 *    and registers no tools (no crash, no registered providers).
 *
 * The isolate driver used for path 1 is a lightweight stub so this script has no
 * native dependency on isolated-vm; it only exercises extension wiring.
 *
 * Run: pnpm --filter @my-agent/core run validate:code-mode-extension
 */
import { createCodeModeExtension } from "../dist/dev.mjs";

// Minimal fake driver: does not actually execute TS, only satisfies the shape.
const fakeDriver = {
  createContext: async () => {
    return {
      bindings: {},
      execute: async (_code) => ({ success: true, value: "ok", logs: [] }),
      dispose: async () => {},
    };
  },
};

function makeCtx({ driver = null, _tools = [] }) {
  const registered = [];
  const providers = [];
  const warns = [];
  const ctx = {
    coreEnv: {
      createIsolateDriver: driver === null ? undefined : async () => driver,
    },
    logger: {
      warn: (msg) => warns.push(String(msg)),
    },
    registerTool: (def) => registered.push(def.name),
    registerContextProvider: (provider) => {
      providers.push(provider);
      return () => {};
    },
  };
  return { ctx, registered, providers, warns };
}

// Dummy tools shaped like AnyServerTool (only name/execute are consumed here).
function tool(name) {
  return { name, description: name, execute: async () => ({ ok: true }) };
}

let failures = 0;
function check(label, cond) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures += 1;
}

// ---- Path 1: driver present ------------------------------------------------
{
  const { ctx, registered, providers } = makeCtx({
    driver: fakeDriver,
    tools: [],
  });
  const ext = createCodeModeExtension({
    tools: [tool("read_file"), tool("run_command")],
    lazyToolNames: ["run_command"],
  });
  await ext.activate(ctx);

  check("driver present -> registers execute_typescript", registered.includes("execute_typescript"));
  check("driver present -> registers discover_tools (lazy present)", registered.includes("discover_tools"));

  const provider = providers.find((p) => typeof p.content === "function");
  check("driver present -> registers a context provider", Boolean(provider));
  const guidance = await provider?.content?.();
  check("context provider -> non-empty code-mode guidance", typeof guidance === "string" && guidance.length > 0);
}

// ---- Path 1b: driver present, no lazy tools => no discover_tools ------------
{
  const { ctx, registered } = makeCtx({ driver: fakeDriver, tools: [] });
  const ext = createCodeModeExtension({
    tools: [tool("read_file")],
    lazyToolNames: [],
  });
  await ext.activate(ctx);
  check(
    "driver present, no lazy -> discover_tools NOT registered",
    registered.includes("execute_typescript") && !registered.includes("discover_tools")
  );
}

// ---- Path 2: driver absent (null) ------------------------------------------
{
  const { ctx, registered, warns } = makeCtx({ driver: null, tools: [] });
  const ext = createCodeModeExtension({
    tools: [tool("read_file")],
  });
  await ext.activate(ctx);
  check("driver null -> registers NO tools", registered.length === 0);
  check("driver null -> warns once", warns.length >= 1);
}

// ---- Path 3: createIsolateDriver throws -> degrade -------------------------
{
  const registered = [];
  const warns = [];
  const ctx = {
    coreEnv: {
      createIsolateDriver: async () => {
        throw new Error("boom");
      },
    },
    logger: { warn: (m) => warns.push(String(m)) },
    registerTool: (def) => registered.push(def.name),
    registerContextProvider: () => () => {},
  };
  const ext = createCodeModeExtension({ tools: [tool("read_file")] });
  await ext.activate(ctx);
  check("driver throws -> registers NO tools", registered.length === 0);
  check("driver throws -> warns", warns.length >= 1);
}

// ---- Path 4: no tools provided -> degrade ----------------------------------
{
  const { ctx, registered, warns } = makeCtx({ driver: fakeDriver, tools: [] });
  const ext = createCodeModeExtension({});
  await ext.activate(ctx);
  check("no tools provided -> registers NO tools", registered.length === 0);
  check("no tools provided -> warns", warns.length >= 1);
}

console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
