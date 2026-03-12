const baseLint = require("project-tool/baseLint");

module.exports = [
  ...baseLint,
  {
    ignores: ["dist", "dev", "scripts", "node_modules", ".output", ".wxt", "**/.wxt", "eslint.config.cjs"],
  },
  {
    settings: {
      "import/resolver": {
        typescript: {
          project: ["./tsconfig.json", "./packages/*/tsconfig.json"],
        },
      },
    },
  },
  {
    rules: {
      "max-lines": ["error", { max: 800, skipBlankLines: true }],
    },
  },
];
