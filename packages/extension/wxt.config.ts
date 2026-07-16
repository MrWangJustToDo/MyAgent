import react from "@my-react/react-vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "wxt";

const nodePathShim = fileURLToPath(new URL("./shims/node-path.ts", import.meta.url));

// See https://wxt.dev/api/config.html
export default defineConfig({
  vite: () => ({
    plugins: [react()],
    resolve: {
      alias: {
        // Map terminal ink → web renderer for browser extension
        ink: "@my-react/react-terminal/web",
        "ink-stream-markdown": "ink-stream-markdown/web",
        // @m234/nerd-fonts imports node:path; MV3 can't use the Node built-in
        "node:path": nodePathShim,
        path: nodePathShim,
      },
      dedupe: ["ink", "@my-react/react-terminal", "ink-stream-markdown", "chalk"],
    },
  }),
  webExt: {
    disabled: true,
  },
  manifest: {
    permissions: ["storage", "sidePanel", "clipboardRead"],
    host_permissions: ["http://localhost/*", "http://127.0.0.1/*", "https://*/*"],
    side_panel: {
      default_path: "sidepanel.html",
    },
    action: {
      default_title: "My Agent",
    },
  },
  outDir: "dist",
  modules: ["@wxt-dev/module-react"],
});
