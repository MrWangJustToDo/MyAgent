import { toolDefinition, type ClientTool, type InferSchemaType, type SchemaInput, type ServerTool } from "@tanstack/ai";

// ============================================================================
// Tool execute context (maps TanStack ToolExecutionContext)
// ============================================================================

export interface ToolExecuteCtx {
  toolCallId: string;
  abortSignal?: AbortSignal;
}

// ============================================================================
// Factories
// ============================================================================

/**
 * Define a TanStack server tool with a stable {@link ToolExecuteCtx} shape.
 */
export function defineServerTool<
  TInput extends SchemaInput,
  TOutput extends SchemaInput,
  const TName extends string,
>(config: {
  name: TName;
  description: string;
  inputSchema?: TInput;
  outputSchema?: TOutput;
  needsApproval?: boolean;
  execute: (
    args: InferSchemaType<TInput>,
    ctx: ToolExecuteCtx
  ) => Promise<InferSchemaType<TOutput>> | InferSchemaType<TOutput>;
}): ServerTool<TInput, TOutput, TName> {
  return toolDefinition({
    name: config.name,
    description: config.description,
    inputSchema: config.inputSchema,
    outputSchema: config.outputSchema,
    needsApproval: config.needsApproval,
  }).server(async (args, ctx) => {
    return config.execute(args, {
      toolCallId: ctx?.toolCallId ?? "",
      abortSignal: ctx?.abortSignal,
    });
  });
}

/**
 * Define a TanStack client tool (no server execute; UI supplies output).
 */
export function defineClientTool<
  TInput extends SchemaInput,
  TOutput extends SchemaInput,
  const TName extends string,
>(config: {
  name: TName;
  description: string;
  inputSchema?: TInput;
  outputSchema?: TOutput;
  needsApproval?: boolean;
}): ClientTool<TInput, TOutput, TName> {
  return toolDefinition({
    name: config.name,
    description: config.description,
    inputSchema: config.inputSchema,
    outputSchema: config.outputSchema,
    needsApproval: config.needsApproval,
  }).client();
}
