import { readImageFromClipboard } from "../utils/clipboard.js";

import { registerCommand } from "./registry.js";

registerCommand({
  name: "paste",
  description: "Paste an image from the system clipboard",
  usage: "/paste",
  execute: async (_args, ctx) => {
    const attachment = await readImageFromClipboard();
    if (attachment) {
      ctx.inputActions.addAttachment(attachment);
      ctx.inputActions.setInputError(null);
      return { ok: true };
    }
    return { ok: false, error: "No image found in clipboard" };
  },
});
