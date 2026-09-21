/**
 * Validation: tree-sitter grammar layer (node's locateTreeSitterGrammar).
 *
 * Run: pnpm --filter @codent/core run validate:tree-sitter
 *
 * Verifies the same mechanism the LSP extension's TreeSitterManager relies on:
 *   - locateTreeSitterGrammar resolves real .wasm grammar bytes from tree-sitter-wasms
 *   - web-tree-sitter Parser.init() + Language.load() + parse() works
 *   - TS/JS parsing yields a tree with expected node types (functions, etc.)
 *   - syntax errors are detected (error nodes) on broken input
 *   - multiple grammars load (typescript + javascript + rust + python)
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const nodePkg = await import("@codent/node");
const env = nodePkg.createNodeEnv({ rootPath: "/tmp", cwd: "/tmp", platform: "linux" });

// web-tree-sitter is a dependency of @codent/node (not hoisted to repo root),
// so resolve it relative to the node package. Use createRequire from the resolved
// @codent/node module to find it in the pnpm store.
// `fileURLToPath`, not `.replace("file://", "")`: on Windows the stripped string starts with
// "/D:/...", which `createRequire` cannot resolve.
const nodeModulePath = fileURLToPath(await import.meta.resolve("@codent/node"));
const req = createRequire(nodeModulePath);
const webTreeSitterUrl = req.resolve("web-tree-sitter");
const { Parser, Language } = await import(webTreeSitterUrl);

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✔" : "✘"} ${name}${detail ? ` — ${detail}` : ""}`);
}

// ---- 1. Parser.init() static method ----
await Parser.init();
record("Parser.init() completes", true);

// ---- 2. locateTreeSitterGrammar resolves real bytes ----
const tsBytes = await env.locateTreeSitterGrammar("tree-sitter-typescript.wasm");
assert.ok(tsBytes && tsBytes.byteLength > 1000, "typescript grammar bytes should be loaded");
record("locateTreeSitterGrammar(typescript) returns bytes", !!tsBytes, `${tsBytes?.byteLength ?? 0} bytes`);

const missing = await env.locateTreeSitterGrammar("tree-sitter-does-not-exist.wasm");
assert.equal(missing, null, "missing grammar should return null");
record("locateTreeSitterGrammar(missing) returns null", missing === null);

// ---- 3. Load + parse TypeScript ----
const tsLanguage = await Language.load(tsBytes);
const parser = new Parser();
parser.setLanguage(tsLanguage);

const goodCode = `interface User { id: number; name: string }
function greet(u: User): string {
  return "Hello " + u.name;
}
class Greeter {
  private prefix = "Hi";
  greet(name: string): string { return this.prefix + " " + name; }
}
const list: number[] = [1, 2, 3];
`;
const tree = parser.parse(goodCode);
assert.ok(tree, "parse should return a tree");
record("TypeScript parse returns tree", !!tree, `root=${tree.rootNode.type}`);

// ---- 4. symbol-ish node types present ----
const root = tree.rootNode;
const nodeTypes = new Set();
function walk(n) {
  nodeTypes.add(n.type);
  for (const c of n.namedChildren) walk(c);
}
walk(root);
const hasFunction = nodeTypes.has("function_declaration");
const hasClass = nodeTypes.has("class_declaration");
const hasInterface = nodeTypes.has("interface_declaration");
const hasArrow = nodeTypes.has("arrow_function");
record(
  "TS node types found (function/class/interface/arrow)",
  hasFunction && hasClass && hasInterface,
  `fn=${hasFunction} class=${hasClass} iface=${hasInterface} arrow=${hasArrow}`
);

// Function name extraction (what lsp_symbols uses)
function findFunction(n) {
  if (n.type === "function_declaration") return n.childForFieldName("name")?.text;
  for (const c of n.namedChildren) {
    const r = findFunction(c);
    if (r) return r;
  }
  return null;
}
const fnName = findFunction(root);
record("function name extractable via field 'name'", fnName === "greet", `name=${fnName}`);

// ---- 5. syntax error detection (tree-sitter fallback for diagnostics) ----
const brokenCode = `function broken( { return 1; }
const x = ;
`;
const brokenTree = parser.parse(brokenCode);
const errorNodes = [];
function findErrors(n) {
  if (n.type === "ERROR" || n.isMissing) errorNodes.push(n);
  for (const c of n.namedChildren) findErrors(c);
}
findErrors(brokenTree.rootNode);
record("syntax errors detected on broken input", errorNodes.length > 0, `${errorNodes.length} error node(s)`);

// ---- 6. multiple grammars load (javascript + rust + python) ----
const jsBytes = await env.locateTreeSitterGrammar("tree-sitter-javascript.wasm");
assert.ok(jsBytes && jsBytes.byteLength > 0);
const jsLang = await Language.load(jsBytes);
const jsParser = new Parser();
jsParser.setLanguage(jsLang);
const jsTree = jsParser.parse("export function add(a, b) { return a + b; }");
const jsRootTypes = new Set();
(function walkJs(n) {
  jsRootTypes.add(n.type);
  for (const c of n.namedChildren) walkJs(c);
})(jsTree.rootNode);
record("JavaScript parse works", jsTree.rootNode.type === "program" && jsRootTypes.has("export_statement"));

const rustBytes = await env.locateTreeSitterGrammar("tree-sitter-rust.wasm");
assert.ok(rustBytes && rustBytes.byteLength > 0);
const rustLang = await Language.load(rustBytes);
const rustParser = new Parser();
rustParser.setLanguage(rustLang);
const rustTree = rustParser.parse('fn main() { println!("hi"); }');
record("Rust parse works", rustTree.rootNode.type === "source_file");

const pyBytes = await env.locateTreeSitterGrammar("tree-sitter-python.wasm");
assert.ok(pyBytes && pyBytes.byteLength > 0);
const pyLang = await Language.load(pyBytes);
const pyParser = new Parser();
pyParser.setLanguage(pyLang);
const pyTree = pyParser.parse("def hello(name):\n    return f'Hello {name}'\n");
record("Python parse works", pyTree.rootNode.type === "module");

// ---- Summary ----
const failed = results.filter((r) => !r.ok);
console.log("\n=== TREE-SITTER VALIDATION ===");
console.log(`Total: ${results.length}, Passed: ${results.length - failed.length}, Failed: ${failed.length}`);
if (failed.length > 0) {
  for (const f of failed) console.log(`  - ${f.name}`);
  process.exit(1);
}
console.log("All tree-sitter checks passed ✅");
