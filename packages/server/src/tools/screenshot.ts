import { tool, z } from "@cyanheads/mcp-ts-core";
import screenshot from "screenshot-desktop";
import sharp from "sharp";

import type { ContentBlock } from "@cyanheads/mcp-ts-core";

const MAX_WIDTH = 1024;
const JPEG_QUALITY = 40;

/** Holds the last captured image for format() without duplicating in structuredContent. */
let lastCapturedImage = "";

export const screenshotTool = tool("screenshot", {
  description: "Capture a screenshot of the current screen. The image is resized and compressed to reduce token usage.",
  input: z.object({
    screen: z.number().int().optional().describe("Display ID to capture. If omitted, captures the primary display."),
  }),
  output: z.object({
    width: z.number().describe("Image width in pixels"),
    height: z.number().describe("Image height in pixels"),
    sizeKB: z.number().describe("Compressed image size in KB"),
  }),
  annotations: {
    title: "Screenshot",
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  },
  async handler(input) {
    const options: { format: "png"; screen?: number } = { format: "png" };
    if (input.screen !== undefined) {
      options.screen = input.screen;
    }

    const rawBuffer: Buffer = await screenshot(options);

    // Resize (keep aspect ratio) and compress to JPEG
    const compressed = await sharp(rawBuffer)
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();

    const metadata = await sharp(compressed).metadata();

    // Store for format() — avoids duplicating base64 in structuredContent
    lastCapturedImage = compressed.toString("base64");

    return {
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
      sizeKB: Math.round(compressed.length / 1024),
    };
  },
  format: (result): ContentBlock[] => [
    {
      type: "image" as const,
      data: lastCapturedImage,
      mimeType: "image/jpeg",
    },
    {
      type: "text" as const,
      text: `Screenshot captured: ${result.width}x${result.height}, ${result.sizeKB}KB`,
    },
  ],
});
