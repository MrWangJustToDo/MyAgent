import { applyColorPalette } from "./colors.js";
import { rebuildMarkdownTheme } from "./markdown-theme.js";

import type { ThemeName } from "./colors.js";

/**
 * Apply UI + markdown theme for the given name.
 * Safe to call from slash commands and at module init.
 */
export function applyAppTheme(name: ThemeName): void {
  applyColorPalette(name);
  rebuildMarkdownTheme();
}
