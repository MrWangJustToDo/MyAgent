import { defineConfig } from "tsdown";

// The published graph must not contain the bare names `react` / `ink`.
//
// Our package.json points those names at @my-react/react / @my-react/react-terminal, but npm
// does NOT dedupe an alias against the real name: a consumer ends up with two physical copies
// of the renderer (`node_modules/@codent/app/node_modules/react` AND
// `node_modules/@my-react/react`), hence two hook dispatchers, and React silently renders
// nothing. pnpm dedupes them — which is exactly why the repo always looked fine and only
// published installs blanked.
//
// Rewritten at RESOLVE time instead of with `alias`, because `alias` also redirects TYPES:
// `import { ReactNode } from "react"` must keep resolving to @types/react, while the runtime
// must resolve to @my-react/react.
const RENDERER_SPECIFIERS: Record<string, string> = {
  react: "@my-react/react",
  "react/jsx-runtime": "@my-react/react/jsx-runtime",
  "react/jsx-dev-runtime": "@my-react/react/jsx-dev-runtime",
  ink: "@my-react/react-terminal",
};

const rewriteRendererSpecifiers = () => ({
  name: "rewrite-renderer-specifiers",
  resolveId(source: string) {
    const real = RENDERER_SPECIFIERS[source];
    return real ? { id: real, external: true } : null;
  },
});

export default defineConfig([
  {
    entry: [
      "src/index.ts",
      "src/utils/lite-diff.ts",
      "src/utils/lite-diff-highlight.ts",
      "src/utils/input-feedback-queue.ts",
      "src/utils/workspace-scroll.ts",
      "src/utils/workspace-git-diff.ts",
      "src/utils/workspace-git-info.ts",
      "src/utils/workspace-git-status.ts",
      "src/utils/workspace-diff-stats.ts",
      "src/utils/workspace-diff-tree.ts",
      "src/utils/workspace-file-search.ts",
      "src/utils/streaming-output-lines.ts",
      "src/utils/format-usage.ts",
      "src/utils/usage-heatmap.ts",
      "src/utils/file-icons.ts",
      "src/utils/tool-activity-summary.ts",
      "src/utils/project-transcript.ts",
      "src/utils/user-message-segments.ts",
      "src/utils/attachment-hash.ts",
      "src/utils/apply-app-config.ts",
      "src/utils/get-messages.ts",
      "src/utils/user-input-helpers.ts",

      "src/utils/streaming-ingest.ts",
    ],
    format: ["esm"],
    dts: true,
    clean: true,
    shims: true,
    plugins: [rewriteRendererSpecifiers()],
    deps: {
      // Only the host-provided rendering primitives stay external, under their real names
      // (the plugin above already rewrote the specifiers). Everything else in the render
      // layer is inlined so a consumer never resolves it.
      neverBundle: [
        "@my-react/react-terminal",
        "@my-react/react",
        "@my-react/react/jsx-runtime",
        "@my-react/react/jsx-dev-runtime",
        "@codent/core",
        // Must stay external: `@git-diff-view/lowlight` imports the `LanguageFn` TYPE from
        // here, and the DTS pass resolves `highlight.js/types/index.d.ts`, which does not
        // export it. Keeping the package external leaves a bare reference in the .d.mts
        // instead of trying to inline a type that cannot be resolved. The RUNTIME
        // highlighter is `lowlight`; this is a type-only edge.
        "highlight.js",
      ],
      // Bundled on purpose. See the note above: `@git-diff-view/cli` declares
      // `peerDependencies: { react: "^19.2.0", ink: "^6.1.0" }`, which our aliases cannot
      // satisfy, so npm handed real react/ink the hoisted slot where every other consumer
      // of bare `ink`/`react` resolved them instead of the fork.
      alwaysBundle: [
        /^@git-diff-view\//,
        "ink-stream-markdown",
        "reactivity-store",
        "chalk",
        "diff",
        "lodash-es",
        "@m234/nerd-fonts",
      ],
    },
  },
]);
