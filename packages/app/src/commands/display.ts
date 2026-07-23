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
  description: "Set transcript display (full outputs vs compact density; fold long explore runs)",
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
    const hint =
      mode === "compact"
        ? " (one-line tools; fold 3+ consecutive reads/searches into path summaries)"
        : " (full tool rows and outputs)";
    return { ok: true, message: `Display mode: ${mode}${hint}` };
  },
});
