/**
 * Demo: slash command `/ping` + toast notify.
 *
 * Try: `/ping` or `/ping hello`
 */
export default {
  id: "demo-ping",
  name: "Demo Ping",
  version: "1.0.0",
  description: "Registers /ping and shows a toast via ctx.ui",
  activate(ctx) {
    ctx.registerCommand({
      name: "ping",
      description: "Extension demo — reply with pong",
      async execute(args) {
        const label = args.length > 0 ? args.join(" ") : "world";
        const message = `pong (${label})`;
        ctx.ui.notify("notify", { message, level: "success" });
        return message;
      },
    });
    ctx.logger.info("registered /ping");
  },
};
