import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/ext.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
});
