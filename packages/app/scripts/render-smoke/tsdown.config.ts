/**
 * Bundles the app's source entrypoints for the headless render smoke, so the smoke can
 * mount the real `MessageList` / `Content` (mixed .ts/.tsx, not part of `dist`) while
 * sharing ONE module instance with the stores they read.
 *
 * Run through `pnpm --filter @codent/app run validate:render-smoke`.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "tsdown";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../../src");

export default defineConfig({
  entry: [
    `${src}/messages/MessageView.tsx`,
    // Mounted directly by the smoke to pin the compact summary's fold window.
    `${src}/messages/CompactionSummaryView.tsx`,
    `${src}/components/MessageList.tsx`,
    `${src}/layout/Content.tsx`,
    `${src}/layout/Header.tsx`,
    `${src}/layout/WelcomePanel.tsx`,
    `${src}/hooks/use-static.ts`,
    `${src}/hooks/use-static-heights.ts`,
    `${src}/hooks/use-agent.ts`,
    `${src}/hooks/use-flatten-cache-cleanup.ts`,
    `${src}/hooks/use-dynamic.ts`,
    `${src}/hooks/use-diff-renderer.ts`,
    `${src}/hooks/use-size.ts`,
    `${src}/hooks/use-agent-status.ts`,
    `${src}/hooks/use-workspace-info.ts`,
    `${src}/hooks/use-theme.ts`,
    `${src}/hooks/use-transcript-display.ts`,
    `${src}/utils/get-messages.ts`,
    `${src}/utils/message-flat-cache.ts`,
    `${src}/utils/project-transcript.ts`,
    // Pure formatter for the task row's turn readout, so the smoke can pin the
    // string without mounting the whole tool row.
    `${src}/messages/task-turns.ts`,
    `${src}/hooks/use-tool-elapsed.ts`,
  ],
  outDir: resolve(here, "dist"),
  format: ["esm"],
  dts: false,
  clean: true,
  shims: true,
  deps: {
    neverBundle: [
      "ink",
      "react",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@codent/core",
      "chalk",
      "ink-stream-markdown",
      "lodash-es",
      "diff",
      "@m234/nerd-fonts",
    ],
  },
});
