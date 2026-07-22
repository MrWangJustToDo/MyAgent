/**
 * Demo: intercept `run_command` and block obvious foot-guns.
 *
 * Try asking the agent to run: `rm -rf /` (should be denied by extension)
 */
export default {
  id: "demo-guard",
  name: "Demo Guard",
  version: "1.0.0",
  description: "Blocks dangerous run_command patterns via tool:before interceptor",
  activate(ctx) {
    const blocked = [/\brm\s+-rf\s+\/\b/i, /\bmkfs\b/i, /\bdd\s+if=/i];

    ctx.registerInterceptor("tool:before:run_command", (event) => {
      const args = event.payload?.args;
      const command =
        args && typeof args === "object" && "command" in args ? String(args.command ?? "") : String(args ?? "");

      if (blocked.some((re) => re.test(command))) {
        event.skip = true;
        event.reason = `Blocked by demo-guard extension: ${command.slice(0, 80)}`;
        ctx.logger.warn(event.reason);
        ctx.ui.notify("notify", { message: event.reason, level: "error" });
        return;
      }

      ctx.logger.info(`allow run_command: ${command.slice(0, 120)}`);
    });

    ctx.logger.info("watching tool:before:run_command");
  },
};
