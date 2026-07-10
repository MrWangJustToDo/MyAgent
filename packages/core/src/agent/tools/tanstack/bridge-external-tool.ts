import { toolDefinition } from "@tanstack/ai";

import type { ClientTool, SchemaInput, ServerTool } from "@tanstack/ai";

// ============================================================================
// Types
// ============================================================================

export type ExternalBridgedTool = {
  description?: string;
  inputSchema?: SchemaInput;
  outputSchema?: SchemaInput;
  needsApproval?: boolean;
  execute?: (args: unknown, options: { toolCallId: string; abortSignal?: AbortSignal }) => Promise<unknown>;
};

/**
 * Bridge a non-TanStack external tool definition into {@link ServerTool}.
 * Used by integrators; in-repo tools use {@link defineServerTool} directly.
 */
export function bridgeExternalToolToServer(name: string, external: ExternalBridgedTool): ServerTool {
  const definition = toolDefinition({
    name,
    description: external.description ?? name,
    inputSchema: external.inputSchema,
    outputSchema: external.outputSchema,
    needsApproval: external.needsApproval,
  });

  if (!external.execute) {
    throw new Error(`Cannot bridge tool "${name}" as server tool: missing execute`);
  }

  const execute = external.execute;

  return definition.server(async (args, ctx) => {
    return execute(args, {
      toolCallId: ctx?.toolCallId ?? "",
      abortSignal: ctx?.abortSignal,
    });
  });
}

/**
 * Bridge a non-TanStack external tool definition into {@link ClientTool}.
 */
export function bridgeExternalToolToClient(name: string, external: ExternalBridgedTool): ClientTool {
  return toolDefinition({
    name,
    description: external.description ?? name,
    inputSchema: external.inputSchema,
    outputSchema: external.outputSchema,
    needsApproval: external.needsApproval,
  }).client();
}
