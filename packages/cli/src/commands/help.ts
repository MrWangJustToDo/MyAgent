import { getAllCommands, registerCommand } from "./registry.js";

registerCommand({
  name: "help",
  description: "List all available commands",
  usage: "/help",
  execute: () => {
    const commands = getAllCommands();
    const lines = commands.map((c) => `  ${c.usage.padEnd(30)} ${c.description}`);
    return { ok: true, message: "Available commands:\n" + lines.join("\n") };
  },
});
