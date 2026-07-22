/**
 * Demo: footer status line + confirm dialog via Extension UI.
 *
 * Try: `/ext-status on|off` and `/ext-confirm`
 */
export default {
  id: "demo-status",
  name: "Demo Status UI",
  version: "1.0.0",
  description: "Exercises set-status and confirm UI channels",
  activate(ctx) {
    ctx.ui.notify("set-status", { text: "ext:demo-status ready" });

    ctx.registerCommand({
      name: "ext-status",
      description: "Extension demo — set footer status (on|off|text…)",
      async execute(args) {
        const mode = (args[0] ?? "on").toLowerCase();
        if (mode === "off" || mode === "clear") {
          ctx.ui.notify("set-status", { text: "" });
          return "status cleared";
        }
        const text = mode === "on" ? "ext:demo-status on" : args.join(" ");
        ctx.ui.notify("set-status", { text });
        return `status → ${text}`;
      },
    });

    ctx.registerCommand({
      name: "ext-confirm",
      description: "Extension demo — show a yes/no confirm dialog",
      async execute() {
        const id = `demo-confirm-${Date.now()}`;
        const answer = await new Promise((resolve) => {
          const timeout = globalThis.setTimeout(() => {
            unsub();
            resolve(false);
          }, 60_000);

          const unsub = ctx.ui.subscribe("confirm:result", (data) => {
            if (!data || data.id !== id) return;
            globalThis.clearTimeout(timeout);
            unsub();
            resolve(Boolean(data.ok));
          });

          ctx.ui.notify("confirm", { id, question: "demo-status: proceed?" });
        });

        const message = answer ? "confirmed" : "denied / timed out";
        ctx.ui.notify("notify", { message, level: answer ? "success" : "info" });
        return message;
      },
    });

    ctx.logger.info("registered /ext-status and /ext-confirm");
  },
};
