/**
 * Demo: extension render surface + transient notifications.
 *
 * Try: `/ext-badge on|off|<text>` and `/ext-notify`
 */
export default {
  id: "demo-status",
  name: "Demo Status UI",
  version: "1.0.0",
  description: "Exercises the generic render surface and host notifications",
  activate(ctx) {
    ctx.ui.render("footer", "demo", "ext:demo-status ready");

    ctx.registerCommand({
      name: "ext-badge",
      description: "Extension demo — set the footer badge (on|off|<text>)",
      async execute(args) {
        const mode = (args[0] ?? "on").toLowerCase();
        if (mode === "off" || mode === "clear") {
          // `null` removes the slot again.
          ctx.ui.render("footer", "demo", null);
          return "badge cleared";
        }
        const text = mode === "on" ? "ext:demo-status on" : args.join(" ");
        ctx.ui.render("footer", "demo", text);
        return `badge → ${text}`;
      },
    });

    ctx.registerCommand({
      name: "ext-notify",
      description: "Extension demo — push a transient host notification",
      async execute() {
        ctx.ui.notify("demo-status: hello from an extension", "success");
        return "notification sent";
      },
    });

    // A layout tree instead of raw text: the same surface renders both.
    ctx.registerCommand({
      name: "ext-tree",
      description: "Extension demo — render a small layout tree",
      async execute() {
        ctx.ui.render("footer", "demo-tree", {
          type: "row",
          gap: 1,
          children: [
            { type: "text", value: "demo" },
            { type: "text", value: "\u001b[2m(tree payload)\u001b[0m" },
          ],
        });
        return "tree rendered";
      },
    });

    ctx.logger.info("registered /ext-badge, /ext-notify and /ext-tree");
  },
};
