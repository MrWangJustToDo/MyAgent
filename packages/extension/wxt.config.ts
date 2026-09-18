import react from "@my-react/react-vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "wxt";

const nodePathShim = fileURLToPath(new URL("./shims/node-path.ts", import.meta.url));

// See https://wxt.dev/api/config.html
export default defineConfig({
  vite: () => ({
    plugins: [react()],
    resolve: {
      // Array form so the renderer alias can be an EXACT match: a plain string key also matches
      // its own subpaths, which would rewrite `@my-react/react-terminal/web` to `.../web/web`.
      alias: [
        { find: /^@my-react\/react-terminal$/, replacement: "@my-react/react-terminal/web" },
        // `@codent/app` emits the renderer under its REAL package name (it rewrites the bare
        // `react` / `ink` specifiers at its own build time, so one renderer instance survives an
        // npm install). Redirecting only `ink` is therefore not enough: both spellings have to
        // land on the browser entry, or the Node entry of the terminal renderer is pulled in —
        // and that one imports `signal-exit`, which touches `process.platform` at module scope.
        { find: "ink", replacement: "@my-react/react-terminal/web" },
        { find: "ink-stream-markdown", replacement: "ink-stream-markdown/web" },
        // @m234/nerd-fonts imports node:path; MV3 can't use the Node built-in
        { find: "node:path", replacement: nodePathShim },
        { find: "path", replacement: nodePathShim },
      ],
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
      default_title: "Codent",
    },
  },
  outDir: "dist",
  modules: ["@wxt-dev/module-react"],
});
