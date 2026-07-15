import { useTranscriptDisplay } from "../hooks/use-transcript-display.js";

import { registerCommand } from "./registry.js";

import type { TranscriptDisplayMode } from "../hooks/use-transcript-display.js";

function parseMode(args: string): TranscriptDisplayMode | null {
  const value = args.trim().toLowerCase();
  if (value === "compact" || value === "full") return value;
  return null;
}

registerCommand({
  name: "display",
  description: "Set transcript display mode (compact summary vs full tools)",
  usage: "/display [compact|full]",
  immediate: true,
  execute: (args) => {
    const { setMode, toggle, getMode } = useTranscriptDisplay.getActions();
    const trimmed = args.trim();

    if (!trimmed) {
      const next = toggle();
      return { ok: true, message: `Display mode: ${next}` };
    }

    const mode = parseMode(trimmed);
    if (!mode) {
      return {
        ok: false,
        error: `Unknown display mode "${trimmed}". Use compact or full. Current: ${getMode()}`,
      };
    }

    setMode(mode);
    return { ok: true, message: `Display mode: ${mode}` };
  },
});
