import react from "@my-react/react-vite";
import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  vite: () => ({
    plugins: [react()],
  }),
  webExt: {
    disabled: true,
  },
  manifest: {
    permissions: ["storage", "sidePanel"],
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
