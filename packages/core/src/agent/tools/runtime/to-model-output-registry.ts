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
 * One entry on a tool's model-output stack.
 *
 * An entry carries ITS OWN implementation, never a reference to what it covered. That is what
 * makes removal trivial: removing one entry (by owner, wherever it sits) and re-reading the top
 * is the same operation whether the entry was live or buried, so nothing has to track who
 * displaced whom.
 */
export interface ToModelOutputEntry {
  /** Who registered it, so an unload can remove exactly its own entries. */
  ownerId: string;
  handler: ToModelOutputFn;
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
  /** Per tool, a stack of handlers in registration order — the last one is live. */
  private readonly stacks = new Map<string, ToModelOutputEntry[]>();
  private readonly decorators = new Map<string, ToModelOutputDecorator[]>();

  /**
   * Push a handler for a tool, shadowing whatever was there.
   *
   * `ownerId` names the registrant so its entry can be removed later without disturbing
   * entries that are still valid. One owner holds at most one entry per tool name: a second
   * registration by the same owner replaces its own entry instead of stacking, which keeps
   * `defineServerTool` — run once per agent for the same built-in names — from growing the
   * stack on every agent creation.
   */
  register(toolName: string, fn: ToModelOutputFn, ownerId = toolName): void {
    const stack = this.stacks.get(toolName);
    if (!stack) {
      this.stacks.set(toolName, [{ ownerId, handler: fn }]);
      return;
    }
    const own = stack.findIndex((entry) => entry.ownerId === ownerId);
    if (own === -1) stack.push({ ownerId, handler: fn });
    else stack[own] = { ownerId, handler: fn };
  }

  /**
   * Remove every entry a given owner pushed, and live with whatever is left.
   *
   * For a tool that went away with its owner this empties the stack, because the push IS the
   * registration. For an extension that merely shadowed an existing tool it pops back to the
   * implementation underneath — the built-in, or an earlier extension. Both are "filter this
   * owner out and re-read the top", which is why neither needs to know what it covered. The
   * built-in's own entry survives because `defineServerTool` owns it, not the extension.
   */
  removeOwner(toolName: string, ownerId: string): void {
    const stack = this.stacks.get(toolName);
    if (!stack) return;
    const remaining = stack.filter((entry) => entry.ownerId !== ownerId);
    if (remaining.length === 0) this.stacks.delete(toolName);
    else this.stacks.set(toolName, remaining);
  }

  /**
   * Forget a tool entirely — its stack and its decorators.
   *
   * For a tool that is gone for good (a removed extension tool) this is belt-and-braces, since
   * {@link removeOwner} already empties its stack. It also clears a decorator another extension
   * installed for that name, which is right: nothing is left to shape.
   */
  unregister(toolName: string): void {
    this.stacks.delete(toolName);
    this.decorators.delete(toolName);
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
    const stack = this.stacks.get(toolName);
    const base = stack?.[stack.length - 1]?.handler;
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
    return this.stacks.has(toolName);
  }

  /**
   * How many stacked registrations exist for a tool.
   *
   * Exists so a guard can assert the stack does not grow when the same owner registers the same
   * name again; not used by production paths.
   */
  stackDepth(toolName: string): number {
    return this.stacks.get(toolName)?.length ?? 0;
  }
}

export const toModelOutputRegistry = new ToModelOutputRegistry();
