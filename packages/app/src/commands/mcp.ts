import { getActiveSession } from "../utils/session-resolve.js";

import { registerCommand } from "./utils/registry.js";

registerCommand({
  name: "mcp",
  description: "List configured MCP servers and their connection status",
  usage: "/mcp",
  immediate: true,
  execute: async (_args, ctx) => {
    const session = ctx.getSession() ?? getActiveSession();
    if (!session) {
      return { ok: false, error: "Agent not initialized" };
    }

    const refreshed = await session.dispatch({ type: "mcp.refresh" });
    const servers =
      refreshed.ok && refreshed.data && typeof refreshed.data === "object" && "servers" in refreshed.data
        ? (refreshed.data as { servers: Array<Record<string, unknown>> }).servers
        : session.getSnapshot().mcp.servers;

    if (servers.length === 0) {
      return { ok: true, message: "No MCP servers configured." };
    }

    const lines: string[] = [];
    for (const s of servers) {
      const status = String(s.status ?? "");
      const icon = status === "connected" ? "✓" : "✗";
      let target = "";
      if (s.command) {
        target = `${s.command}${Array.isArray(s.args) ? " " + s.args.join(" ") : ""}`;
      } else if (s.url) {
        target = String(s.url);
      }
      const name = String(s.name ?? "");
      const transport = String(s.transport ?? "");
      const toolCount = Number(s.toolCount ?? 0);
      lines.push(
        `  ${icon} ${name.padEnd(20)} ${transport.padEnd(6)} ${String(toolCount).padStart(3)} tools  ${target}`.trimEnd()
      );
      if (status === "failed" && s.error) {
        lines.push(`      └─ failed: ${s.error}`);
      }
    }

    const connected = servers.filter((s) => s.status === "connected").length;
    const header = `MCP servers (${connected}/${servers.length} connected)`;
    return { ok: true, message: `${header}:\n${lines.join("\n")}` };
  },
});
