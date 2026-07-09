import { registerCommand } from "./registry.js";

registerCommand({
  name: "mcp",
  description: "List configured MCP servers and their connection status",
  usage: "/mcp",
  immediate: true,
  execute: (args, ctx) => {
    const agent = ctx.getAgent();
    if (!agent) {
      return { ok: false, error: "Agent not initialized" };
    }

    const mcpManager = agent.getMcpManager();
    if (!mcpManager) {
      return { ok: false, error: "MCP manager not available" };
    }

    const servers = mcpManager.getServerStatuses();
    if (servers.length === 0) {
      return { ok: true, message: "No MCP servers configured." };
    }

    const lines: string[] = [];

    for (const s of servers) {
      const icon = s.status === "connected" ? "✓" : "✗";

      // Build target description (command or URL)
      let target = "";
      if (s.command) {
        target = `${s.command}${s.args ? " " + s.args.join(" ") : ""}`;
      } else if (s.url) {
        target = s.url;
      }

      // Format:   ✓ server_name        stdio  3 tools  npx command
      const line =
        `  ${icon} ${s.name.padEnd(20)} ${s.transport.padEnd(6)} ${String(s.toolCount).padStart(3)} tools  ${target}`.trimEnd();
      lines.push(line);

      // For failed servers, show the error on the next line, indented
      if (s.status === "failed" && s.error) {
        const statusTag = `failed: ${s.error}`;
        lines.push(`      └─ ${statusTag}`);
      }
    }

    const header = `MCP servers (${servers.filter((s) => s.status === "connected").length}/${servers.length} connected)`;
    return { ok: true, message: `${header}:\n${lines.join("\n")}` };
  },
});
