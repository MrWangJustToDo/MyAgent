import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.tsx"],
  format: ["esm"],
  dts: true,
  clean: true,
  shims: true,
  alias: {
    react: "@my-react/react",
    "react/jsx-runtime": "@my-react/react/jsx-runtime",
    "react/jsx-dev-runtime": "@my-react/react/jsx-dev-runtime",
  },
});
