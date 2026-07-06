import react from "@my-react/react-vite";
import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  vite: () => ({
    plugins: [react()],
    resolve: {
      alias: {
        // Map terminal ink → web renderer for browser extension
        ink: "@my-react/react-terminal/web",
        "ink-stream-markdown": "ink-stream-markdown/web",
      },
      dedupe: ["ink", "@my-react/react-terminal", "ink-stream-markdown"],
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
