import react from "@my-react/react-vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

import { stubNodeBuiltins } from "./vite-plugins/stub-node-builtins.js";

const nodePathShim = fileURLToPath(new URL("./shims/node-path.ts", import.meta.url));

/**
 * WebContainers need SharedArrayBuffer → cross-origin isolation.
 * Dev/preview set COOP/COEP directly; GitHub Pages cannot — use public/coi-serviceworker.js.
 */
export default defineConfig({
  plugins: [stubNodeBuiltins(), react()],
  base: "./",
  resolve: {
    alias: {
      react: "@my-react/react",
      "react-dom": "@my-react/react-dom",
      ink: "@my-react/react-terminal/web",
      "ink-stream-markdown": "ink-stream-markdown/web",
      // keep path alias for packages that resolve without the plugin first
      "node:path": nodePathShim,
      path: nodePathShim,
    },
    dedupe: ["ink", "@my-react/react-terminal", "ink-stream-markdown"],
  },
  server: {
    port: 5177,
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
  preview: {
    port: 5177,
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
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
