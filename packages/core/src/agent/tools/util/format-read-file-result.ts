import type { ReadFileOutput } from "../read-file-tool.js";
import type { ContentPart } from "@tanstack/ai";

/**
 * Convert read_file execute output for the model via TanStack {@link normalizeToolResult}.
 * Image/PDF paths return multimodal {@link ContentPart}[]; text/directory stay structured.
 */
export function formatReadFileToolResult(output: ReadFileOutput): ReadFileOutput | ContentPart[] {
  if (output.type === "image") {
    return [
      { type: "text", content: `Image read: ${output.path} (${Math.round(output.size / 1024)}KB)` },
      {
        type: "image",
        source: { type: "data", value: output.base64, mimeType: output.mimeType },
      },
    ];
  }

  if (output.type === "pdf") {
    return [
      { type: "text", content: `PDF read: ${output.path} (${Math.round(output.size / 1024)}KB)` },
      {
        type: "document",
        source: { type: "data", value: output.base64, mimeType: "application/pdf" },
      },
    ];
  }

  return output;
}
