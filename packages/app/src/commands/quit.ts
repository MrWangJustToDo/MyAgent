import { registerCommand } from "./registry.js";

registerCommand({
  name: "quit",
  description: "Exit the cli",
  usage: "/quit",
  immediate: true,
  execute: (_args, ctx) => {
    if (ctx.exit) {
      ctx.exit();
    }
    return { ok: true };
  },
});
