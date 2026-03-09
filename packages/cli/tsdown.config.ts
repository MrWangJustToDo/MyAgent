import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.tsx"],
  format: ["esm"],
  dts: true,
  clean: true,
  shims: true,
  deps: {
    neverBundle: ["ink", "react", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
});
