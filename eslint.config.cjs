const baseLint = require("project-tool/baseLint");

module.exports = [
  ...baseLint,
  {
    ignores: ["dist", "dev", "scripts", "node_modules", ".output", ".wxt", "eslint.config.cjs"],
  },
];
