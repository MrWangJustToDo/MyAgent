import { useThinkingLine } from "../hooks/use-thinking-line.js";

import { registerCommand } from "./utils/registry.js";

registerCommand({
  name: "thinking",
  description: "Toggle thinking content display in the footer",
  usage: "/thinking [on|off]",
  immediate: false,
  getOptions: () => {
    const current = useThinkingLine.getActions().getEnabled();
    return [
      {
        label: "toggle",
        value: "",
        description: `Toggle thinking display (current: ${current ? "on" : "off"})`,
      },
      {
        label: "on",
        value: "on",
        description: current ? "current" : "Show thinking content in footer",
      },
      {
        label: "off",
        value: "off",
        description: current ? "Hide thinking content from footer" : "current",
      },
    ];
  },
  execute: (args) => {
    const { setEnabled, toggle, getEnabled } = useThinkingLine.getActions();
    const trimmed = args.trim().toLowerCase();

    if (!trimmed || trimmed === "toggle") {
      const next = toggle();
      return { ok: true, message: `Thinking display: ${next ? "on" : "off"}` };
    }

    if (trimmed !== "on" && trimmed !== "off") {
      return {
        ok: false,
        error: `Unknown option "${trimmed}". Use on, off, or toggle. Current: ${getEnabled() ? "on" : "off"}`,
      };
    }

    const next = trimmed === "on";
    setEnabled(next);
    return { ok: true, message: `Thinking display: ${next ? "on" : "off"}` };
  },
});
