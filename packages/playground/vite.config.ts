import react from "@my-react/react-vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

import { fetchProxyPlugin } from "./vite-plugins/fetch-proxy.js";
import { stubNodeBuiltins } from "./vite-plugins/stub-node-builtins.js";

const nodePathShim = fileURLToPath(new URL("./shims/node-path.ts", import.meta.url));

/**
 * WebContainers need SharedArrayBuffer → cross-origin isolation.
 * Dev/preview set COOP/COEP directly; GitHub Pages cannot — use public/coi-serviceworker.js.
 * Web tools need `/__fetch_proxy` (this plugin) or a Cloudflare Worker on Pages.
 */
export default defineConfig({
  plugins: [stubNodeBuiltins(), fetchProxyPlugin(), react()],
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
    // One chalk instance so force-chalk-color covers Ink + @my-agent/app
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
