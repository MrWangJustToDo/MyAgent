import type { ToModelOutputFn } from "../../tools/runtime/to-model-output-registry.js";

export interface ToModelOutputRegistry {
  get(toolName: string): ToModelOutputFn | undefined;
}
