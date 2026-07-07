import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/dev.ts"],
  format: ["esm"],
  dts: {
    entry: ["src/index.ts"],
  },
  clean: true,
});
