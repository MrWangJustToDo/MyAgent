import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/client.ts", "src/remote-session-client.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
});
