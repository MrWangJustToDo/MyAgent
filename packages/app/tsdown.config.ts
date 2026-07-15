import { defineConfig } from "tsdown";

export default defineConfig([
  {
    entry: [
      "src/index.ts",
      "src/utils/input-feedback-queue.ts",
      "src/utils/workspace-scroll.ts",
      "src/utils/workspace-git-diff.ts",
      "src/utils/workspace-git-info.ts",
      "src/utils/diff-frame.ts",
      "src/utils/streaming-output-lines.ts",
      "src/utils/format-usage.ts",
      "src/utils/file-icons.ts",
      "src/utils/tool-activity-summary.ts",
      "src/utils/project-transcript.ts",

      "src/hooks/streaming-ingest.ts",
    ],
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
        "@m234/nerd-fonts",
      ],
    },
  },
]);
