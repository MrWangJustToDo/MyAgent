import { getAllCommands, registerCommand } from "./registry.js";

registerCommand({
  name: "help",
  description: "Show available commands",
  usage: "/help",
  immediate: true,
  execute: () => {
    const commands = getAllCommands();
    const lines = commands.map((c) => `  ${c.usage.padEnd(30)} ${c.description}`);
    return { ok: true, message: "Available commands:\n" + lines.join("\n") };
  },
});
