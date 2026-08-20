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

/**
 * Decorator: wraps the base `toModelOutput` handler for a tool, letting
 * extensions augment the model-facing content (e.g. append LSP diagnostics).
 * `next` invokes the underlying handler chain.
 */
export type ToModelOutputDecorator = (
  ctx: ToModelOutputContext,
  next: ToModelOutputFn
) => Promise<ModelToolContent> | ModelToolContent;

// ============================================================================
// Registry
// ============================================================================

class ToModelOutputRegistry {
  private readonly handlers = new Map<string, ToModelOutputFn>();
  private readonly decorators = new Map<string, ToModelOutputDecorator[]>();

  register(toolName: string, fn: ToModelOutputFn): void {
    this.handlers.set(toolName, fn);
  }

  /**
   * Wrap the existing handler for a tool with a decorator (chainable).
   *
   * The decorator receives the composed chain as `next` (base handler plus any
   * previously registered decorators) and may augment its result. If no base
   * handler is registered yet, the decorator is stored and applied later once
   * the base appears (via {@link get}).
   */
  registerDecorator(toolName: string, fn: ToModelOutputDecorator): void {
    const list = this.decorators.get(toolName);
    if (list) {
      list.push(fn);
    } else {
      this.decorators.set(toolName, [fn]);
    }
  }

  get(toolName: string): ToModelOutputFn | undefined {
    const base = this.handlers.get(toolName);
    const decos = this.decorators.get(toolName);
    if (!base || !decos || decos.length === 0) return base;

    return async (ctx) => {
      // Build the chain: base handler first, then decorators in registration order.
      let chain: ToModelOutputFn = base;
      for (const deco of decos) {
        const prev = chain;
        chain = async (innerCtx) => deco(innerCtx, prev);
      }
      return chain(ctx);
    };
  }

  has(toolName: string): boolean {
    return this.handlers.has(toolName);
  }
}

export const toModelOutputRegistry = new ToModelOutputRegistry();
