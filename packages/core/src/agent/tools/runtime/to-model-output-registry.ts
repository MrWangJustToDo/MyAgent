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

/**
 * Point-in-time copy of the handlers registered for one tool.
 *
 * The decorator chain is kept as-is (not composed) so restoring a snapshot cannot
 * double-wrap a decorator that is still installed.
 */
export interface ToModelOutputSnapshot {
  handler?: ToModelOutputFn;
  decorators?: readonly ToModelOutputDecorator[];
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
   * Drop everything registered for one tool.
   *
   * Needed when a tool that owned a handler goes away — an extension registering a
   * tool name replaces the previous handler (see {@link register}), but unregistering
   * the extension only removed it from the tools record, leaving this registry shaping
   * the restored tool's results with the unloaded extension's function.
   */
  unregister(toolName: string): void {
    this.handlers.delete(toolName);
    this.decorators.delete(toolName);
  }

  /**
   * Copy the current handler + decorators for one tool, for a later {@link restore}.
   * `undefined` means nothing is registered — a valid snapshot (it restores "none").
   */
  snapshot(toolName: string): ToModelOutputSnapshot | undefined {
    const handler = this.handlers.get(toolName);
    const decorators = this.decorators.get(toolName);
    if (!handler && !decorators) return undefined;
    return {
      ...(handler ? { handler } : {}),
      ...(decorators ? { decorators: [...decorators] } : {}),
    };
  }

  /** Put a tool's handler/decorators back exactly as {@link snapshot} found them. */
  restore(toolName: string, snapshot: ToModelOutputSnapshot | undefined): void {
    this.unregister(toolName);
    if (!snapshot) return;
    if (snapshot.handler) this.handlers.set(toolName, snapshot.handler);
    if (snapshot.decorators) this.decorators.set(toolName, [...snapshot.decorators]);
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
