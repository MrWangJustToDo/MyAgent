import { toolDefinition, type ClientTool, type InferSchemaType, type SchemaInput, type ServerTool } from "@tanstack/ai";

import { toModelOutputRegistry, type ModelToolContent, type ToModelOutputContext } from "./to-model-output-registry.js";
import { registerToUI } from "./to-ui-registry.js";

// ============================================================================
// Tool execute context (maps TanStack ToolExecutionContext)
// ============================================================================

export interface ToolExecuteCtx {
  toolCallId: string;
  abortSignal?: AbortSignal;
}

export type { ModelToolContent, ToModelOutputContext };
export { toModelOutputRegistry };

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
  toModelOutput?: (
    ctx: ToModelOutputContext & { input: InferSchemaType<TInput>; output: InferSchemaType<TOutput> }
  ) => Promise<ModelToolContent> | ModelToolContent;
  toUI?: (result: InferSchemaType<TOutput>) => string;
}): ServerTool<TInput, TOutput, TName> {
  if (config.toModelOutput) {
    const toModel = config.toModelOutput;
    toModelOutputRegistry.register(config.name, (ctx) =>
      toModel({
        toolCallId: ctx.toolCallId,
        input: ctx.input as InferSchemaType<TInput>,
        output: ctx.output as InferSchemaType<TOutput>,
      })
    );
  }

  if (config.toUI) {
    registerToUI(config.name, config.toUI as (result: unknown) => string);
  }

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
