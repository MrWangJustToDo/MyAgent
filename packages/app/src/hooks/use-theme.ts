import { createState } from "reactivity-store";

import { applyAppTheme } from "../theme/apply-theme.js";

import type { ThemeName } from "../theme/colors.js";

export type { ThemeName };

export const useTheme = createState(
  () => ({
    theme: "gemini" as ThemeName,
  }),
  {
    withActions: (state) => ({
      setTheme: (theme: ThemeName): ThemeName => {
        state.theme = theme;
        applyAppTheme(theme);
        return state.theme;
      },
      toggle: (): ThemeName => {
        const next: ThemeName = state.theme === "gemini" ? "claude" : "gemini";
        state.theme = next;
        applyAppTheme(next);
        return state.theme;
      },
      getTheme: (): ThemeName => state.theme,
    }),
    withDeepSelector: false,
    withStableSelector: true,
  }
);

// Keep palette in sync with the default store value on first load.
applyAppTheme("gemini");
