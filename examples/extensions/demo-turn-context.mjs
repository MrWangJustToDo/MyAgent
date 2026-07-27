/**
 * Demo: per-turn extension context via `before_agent_start` + turn-context provider.
 *
 * Try:
 * - `/ext-turn on` then ask the agent anything — it should see extension_context in system prompt
 * - `/ext-turn off` to disable
 * - `/ext-turn tab example.com` to set a fake active-tab label
 */
export default {
  id: "demo-turn-context",
  name: "Demo Turn Context",
  version: "1.0.0",
  description: "Injects per-turn extension_context / appendSystemPrompt for prompt-hook testing",
  activate(ctx) {
    let enabled = true;
    let tabLabel = "demo-tab.local";

    ctx.registerTurnContextProvider(() => {
      if (!enabled) return undefined;
      return `active_tab: ${tabLabel}`;
    });

    ctx.registerInterceptor("before_agent_start", (event) => {
      if (!enabled) return;
      event.appendTurnContext = `demo-turn-context: prompt length=${event.payload.prompt.length}`;
      event.appendSystemPrompt =
        "Extension demo: prefer acknowledging the active_tab from <extension_context> when relevant.";
    });

    ctx.registerCommand({
      name: "ext-turn",
      description: "Extension demo — toggle turn context (on|off|tab <label>)",
      async execute(args) {
        const mode = (args[0] ?? "status").toLowerCase();
        if (mode === "off" || mode === "clear") {
          enabled = false;
          return "turn-context demo disabled";
        }
        if (mode === "on") {
          enabled = true;
          return `turn-context demo enabled (tab=${tabLabel})`;
        }
        if (mode === "tab") {
          const label = args.slice(1).join(" ").trim();
          if (!label) return "usage: /ext-turn tab <label>";
          tabLabel = label;
          enabled = true;
          return `active tab label → ${tabLabel}`;
        }
        return `turn-context demo ${enabled ? "on" : "off"} (tab=${tabLabel})`;
      },
    });

    ctx.logger.info("registered turn-context hooks + /ext-turn");
  },
};
