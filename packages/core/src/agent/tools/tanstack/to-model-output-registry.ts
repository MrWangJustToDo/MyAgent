import type { ContentPart } from "@tanstack/ai";

// ============================================================================
// Types
// ============================================================================

export type ModelToolContent = string | ContentPart[];

export interface ToModelOutputContext {
  toolCallId: string;
  input: unknown;
  output: unknown;
}

export type ToModelOutputFn = (ctx: ToModelOutputContext) => Promise<ModelToolContent> | ModelToolContent;

// ============================================================================
// Registry
// ============================================================================

class ToModelOutputRegistry {
  private readonly handlers = new Map<string, ToModelOutputFn>();

  register(toolName: string, fn: ToModelOutputFn): void {
    this.handlers.set(toolName, fn);
  }

  get(toolName: string): ToModelOutputFn | undefined {
    return this.handlers.get(toolName);
  }

  has(toolName: string): boolean {
    return this.handlers.has(toolName);
  }
}

export const toModelOutputRegistry = new ToModelOutputRegistry();
