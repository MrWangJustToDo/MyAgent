export const loadDevtool = () => {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    // Resolves to `devtool/index.js`, the devtools bundle that `init.mjs`
    // downloads in this package's `postinstall` -- gitignored, so it is absent
    // on a fresh checkout and in CI (`--ignore-scripts`). Lint is static and
    // cannot see it; the production bundle can, because `import.meta.env.DEV`
    // folds to `false` and the branch is tree-shaken before resolution. The
    // rule is scoped off for this file in eslint.config.cjs.
    import(".");
  }
};
