import { defineConfig } from "tsdown";

import {
  CORE_EXTERNAL,
  ENTRIES,
  RENDERER_EXTERNAL,
  RUNTIME_DEPENDENCIES,
  TYPES_EXTERNAL,
  rewriteRendererSpecifiers,
} from "./tsdown.shared.ts";

/**
 * Release `@codent/app` build — inlines every third-party dependency.
 *
 * Run with `pnpm build:release` (or `tsdown --config tsdown.config.release.ts`); it is **not**
 * the default, and it is not what the in-repo hosts consume. Its only consumers are a bundle
 * that must carry no resolvable third-party specifier at all — `packages/codent`, which inlines
 * everything — and the `publish:packages` library path.
 *
 * Why this cannot be the default: inlining forces one module form into the artifact before any
 * host has a say. `reactivity-store` is the worked example — this build resolves it on the Node
 * platform target, so it lands as its **CJS** entry (`require("react")`), which a browser host
 * cannot execute; the playground's `node:module` stub turns that `require` into a thrown
 * `require() is not available in the browser`. A host that resolves the package itself picks the
 * `module` (ESM) entry instead and the problem does not exist.
 *
 * `@git-diff-view/*` is bundled even here, unlike the default build: nothing satisfies its
 * `peerDependencies: { react: "^19.2.0", ink: "^6.1.0" }` at install time, so a host resolving
 * it by bare name would get real react/ink rather than the fork.
 */
export default defineConfig([
  {
    entry: [...ENTRIES],
    format: ["esm"],
    dts: true,
    clean: true,
    shims: true,
    plugins: [rewriteRendererSpecifiers()],
    deps: {
      // Only the host-provided rendering primitives stay external, under their real names
      // (the plugin above already rewrote the specifiers). Everything else in the render
      // layer is inlined so a consumer never resolves it.
      neverBundle: [...RENDERER_EXTERNAL, ...TYPES_EXTERNAL, ...CORE_EXTERNAL],
      alwaysBundle: RUNTIME_DEPENDENCIES,
    },
  },
]);
