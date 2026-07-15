import { createState } from "reactivity-store";

import type { TranscriptDisplayMode } from "../utils/project-transcript.js";

export type { TranscriptDisplayMode };

export const useTranscriptDisplay = createState(
  () => ({
    mode: "full" as TranscriptDisplayMode,
  }),
  {
    withActions: (state) => ({
      setMode: (mode: TranscriptDisplayMode): TranscriptDisplayMode => {
        state.mode = mode;
        return state.mode;
      },
      toggle: (): TranscriptDisplayMode => {
        state.mode = state.mode === "compact" ? "full" : "compact";
        return state.mode;
      },
      getMode: (): TranscriptDisplayMode => state.mode,
    }),
    withNamespace: "useTranscriptDisplay",
    withDeepSelector: false,
    withStableSelector: true,
  }
);
