import { useTranscriptDisplay } from "../hooks/use-transcript-display.js";

import { registerCommand } from "./registry.js";

import type { TranscriptDisplayMode } from "../hooks/use-transcript-display.js";

const DISPLAY_MODES: readonly TranscriptDisplayMode[] = ["compact", "full"];

function parseMode(args: string): TranscriptDisplayMode | null {
  const value = args.trim().toLowerCase();
  if (value === "compact" || value === "full") return value;
  return null;
}

registerCommand({
  name: "display",
  description: "Set transcript display (full outputs vs compact density; fold long explore runs)",
  usage: "/display [compact|full]",
  immediate: false,
  getOptions: () => {
    const current = useTranscriptDisplay.getActions().getMode();
    return [
      {
        label: "toggle",
        value: "",
        description: `Switch mode (current: ${current})`,
      },
      ...DISPLAY_MODES.map((mode) => ({
        label: mode,
        value: mode,
        description:
          mode === current
            ? "current"
            : mode === "compact"
              ? "One-line tools; fold consecutive reads/searches"
              : "Full tool rows and outputs",
      })),
    ];
  },
  execute: (args) => {
    const { setMode, toggle, getMode } = useTranscriptDisplay.getActions();
    const trimmed = args.trim().toLowerCase();

    if (!trimmed || trimmed === "toggle") {
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
