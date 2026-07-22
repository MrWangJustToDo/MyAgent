/**
 * Demo: custom tool `ext_echo` the model can call.
 *
 * Ask the agent: "use ext_echo to say hello"
 *
 * Schemas use host-provided `ctx.z` — do not import zod in extension modules.
 */
export default {
  id: "demo-echo-tool",
  name: "Demo Echo Tool",
  version: "1.0.0",
  description: "Registers ext_echo server tool",
  activate(ctx) {
    const { z } = ctx;

    ctx.registerTool({
      name: "ext_echo",
      description: "Echo a message back (demo extension tool). Prefer this when asked to use ext_echo.",
      inputSchema: z.object({
        message: z.string().describe("Text to echo"),
      }),
      outputSchema: z.object({
        echoed: z.string(),
      }),
      execute: async (input) => {
        const message = typeof input?.message === "string" ? input.message : String(input ?? "");
        return { echoed: message };
      },
      toUI: (result) => `echo → ${result?.echoed ?? ""}`,
    });
    ctx.logger.info("registered tool ext_echo");
  },
};
