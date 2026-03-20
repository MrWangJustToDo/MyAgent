const baseLint = require("project-tool/baseLint");
const reactLint = require("project-tool/reactLint");

module.exports = [
  ...baseLint,
  {
    ignores: ["dist", "dev", "scripts", "node_modules", ".output", ".wxt", "**/.wxt", "eslint.config.cjs"],
  },
  {
    settings: {
      "import/resolver": {
        typescript: {
          project: ["./tsconfig.json"],
        },
      },
    },
  },
  {
    rules: {
      "max-lines": ["error", { max: 800, skipBlankLines: true }],
    },
  },
  // React config for ui/* and site/graphql
  {
    files: ["cli/src/**/*.{ts,tsx}", "extension/**/*.{ts,tsx}"],
    ...reactLint.reduce((acc, config) => {
      return {
        ...acc,
        ...config,
        plugins: { ...acc.plugins, ...config.plugins },
        rules: { ...acc.rules, ...config.rules },
        settings: { ...acc.settings, ...config.settings },
      };
    }, {}),
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
  },
];
