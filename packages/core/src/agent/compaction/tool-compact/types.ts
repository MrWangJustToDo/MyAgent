import type { ToModelOutputFn } from "../../tools/tanstack/to-model-output-registry.js";

export interface ToModelOutputRegistry {
  get(toolName: string): ToModelOutputFn | undefined;
}
