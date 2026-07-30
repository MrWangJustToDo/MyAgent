import { createContext, useContext } from "react";

import type { TranscriptDisplayMode } from "../utils/project-transcript.js";

/** Transcript display density for MessageView / tool rows (default: full). */
export const TranscriptDisplayContext = createContext<TranscriptDisplayMode>("full");

export function useTranscriptDisplayMode(): TranscriptDisplayMode {
  return useContext(TranscriptDisplayContext);
}
