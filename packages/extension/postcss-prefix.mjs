/**
 * Custom PostCSS plugin to prefix all selectors with a given selector.
 * This avoids the "from" option warning from other plugins.
 */
const IGNORED_SELECTORS = [":root", "html", "body", ":host", "from", "to"];

export default function prefixSelector(prefix) {
  return {
    postcssPlugin: "postcss-prefix-custom",
    Rule(rule) {
      // Skip keyframes
      if (rule.parent?.type === "atrule" && rule.parent?.name === "keyframes") {
        return;
      }

      rule.selectors = rule.selectors.map((selector) => {
        // Skip ignored selectors
        const trimmed = selector.trim();
        if (IGNORED_SELECTORS.some((s) => trimmed === s || trimmed.startsWith(s + " "))) {
          return selector;
        }

        // Skip selectors that already have the prefix
        if (selector.includes(prefix)) {
          return selector;
        }

        return `${prefix} ${selector}`;
      });
    },
  };
}

prefixSelector.postcss = true;
