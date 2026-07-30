import { formatKeyboardShortcutsHelp } from "../utils/keyboard-labels.js";

import { registerCommand } from "./utils/registry.js";

registerCommand({
  name: "shortcuts",
  description: "Show all keyboard shortcuts",
  usage: "/shortcuts",
  immediate: true,
  execute: () => ({
    ok: true,
    message: formatKeyboardShortcutsHelp(),
  }),
});
