import { useTheme } from "../hooks/use-theme.js";
import { isThemeName, THEME_NAMES } from "../theme/colors.js";

import { registerCommand } from "./registry.js";

registerCommand({
  name: "theme",
  description: "Set UI color theme (gemini vs claude)",
  usage: "/theme [gemini|claude]",
  immediate: false,
  getOptions: () => {
    const current = useTheme.getActions().getTheme();
    return [
      {
        label: "toggle",
        value: "",
        description: `Switch theme (current: ${current})`,
      },
      ...THEME_NAMES.map((name) => ({
        label: name,
        value: name,
        description: name === current ? "current" : `Use ${name} palette`,
      })),
    ];
  },
  execute: (args) => {
    const { setTheme, toggle, getTheme } = useTheme.getActions();
    const trimmed = args.trim().toLowerCase();

    if (!trimmed || trimmed === "toggle") {
      const next = toggle();
      return { ok: true, message: `Theme: ${next}` };
    }

    if (!isThemeName(trimmed)) {
      return {
        ok: false,
        error: `Unknown theme "${trimmed}". Use ${THEME_NAMES.join(" or ")}. Current: ${getTheme()}`,
      };
    }

    setTheme(trimmed);
    return { ok: true, message: `Theme: ${trimmed}` };
  },
});
