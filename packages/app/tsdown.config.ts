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
 * Default `@codent/app` build — what `pnpm build` and every host in this repo consume.
 *
 * Dependencies are left **external**. Each host then resolves a dependency once, in the form
 * that host needs: the playground and the extension let Vite pick the `module` (ESM) entry and
 * apply their browser aliases, and a Node host resolves the CJS entry where that is correct.
 * Inlining here instead would freeze a single form into the artifact and make every host bundle
 * the same code a second time (see `tsdown.shared.ts`).
 *
 * The release build in `tsdown.config.release.ts` is the opposite trade: it inlines everything
 * so a host that must ship one self-contained tarball has nothing left to resolve. Run it with
 * `pnpm build:release`.
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
      neverBundle: [...RENDERER_EXTERNAL, ...TYPES_EXTERNAL, ...CORE_EXTERNAL, ...RUNTIME_DEPENDENCIES],
    },
  },
]);
