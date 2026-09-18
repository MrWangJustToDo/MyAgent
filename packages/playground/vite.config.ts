import react from "@my-react/react-vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

import { fetchProxyPlugin } from "./vite-plugins/fetch-proxy.js";
import { stubNodeBuiltins } from "./vite-plugins/stub-node-builtins.js";

const nodePathShim = fileURLToPath(new URL("./shims/node-path.ts", import.meta.url));
const treeSitterWasms = fileURLToPath(new URL("./node_modules/tree-sitter-wasms", import.meta.url));

/**
 * WebContainers need SharedArrayBuffer → cross-origin isolation.
 * Dev/preview set COOP/COEP directly; GitHub Pages cannot — use public/coi-serviceworker.js.
 * Web tools need `/__fetch_proxy` (this plugin) or a Cloudflare Worker on Pages.
 */
export default defineConfig({
  plugins: [stubNodeBuiltins(), fetchProxyPlugin(), react()],
  base: "./",
  resolve: {
    // Array form so the renderer alias can be an EXACT match: a plain string key also matches
    // its own subpaths, which would rewrite `@my-react/react-terminal/web` to `.../web/web`.
    alias: [
      { find: /^@my-react\/react-terminal$/, replacement: "@my-react/react-terminal/web" },
      { find: "react", replacement: "@my-react/react" },
      { find: "react-dom", replacement: "@my-react/react-dom" },
      // `@codent/app` emits the renderer under its REAL package name (it rewrites the bare
      // `react` / `ink` specifiers at its own build time, so one renderer instance survives an
      // npm install). Redirecting only `ink` is therefore not enough: both spellings have to
      // land on the browser entry, or the Node entry of the terminal renderer is pulled in —
      // and that one imports `signal-exit`, which touches `process.platform` at module scope.
      { find: "ink", replacement: "@my-react/react-terminal/web" },
      { find: "ink-stream-markdown", replacement: "ink-stream-markdown/web" },
      // keep path alias for packages that resolve without the plugin first
      { find: "node:path", replacement: nodePathShim },
      { find: "path", replacement: nodePathShim },
      { find: "tree-sitter-wasms", replacement: treeSitterWasms },
    ],
    // One chalk instance so force-chalk-color covers Ink + @codent/app
    dedupe: ["ink", "@my-react/react-terminal", "ink-stream-markdown", "chalk"],
  },

  server: {
    port: 5177,
    headers: {
      "Cross-Origin-Embedder-Policy": "credentialless",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
  preview: {
    port: 5177,
    headers: {
      "Cross-Origin-Embedder-Policy": "credentialless",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
  optimizeDeps: {
    exclude: ["@webcontainer/api"],
  },
  build: {
    target: "es2022",
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  esbuild: {
    target: "es2022",
  },
});
