import { defineConfig } from "tsdown";

export default defineConfig([
  {
    entry: ["src/index.ts", "src/utils/input-feedback-queue.ts", "src/hooks/streaming-ingest.ts"],
    format: ["esm"],
    dts: true,
    clean: true,
    shims: true,
    deps: {
      neverBundle: [
        "ink",
        "react",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@my-agent/core",
        "@my-agent/node",
        "chalk",
        "ink-stream-markdown",
        "@git-diff-view/cli",
        "@git-diff-view/file",
        "@git-diff-view/core",
      ],
    },
  },
]);
