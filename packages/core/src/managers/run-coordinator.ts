import { getMaxReactiveRetries } from "../agent/compaction/reactive-compact.js";

const MAX_REACTIVE_RETRIES = getMaxReactiveRetries();

export interface AbortControllerSetup {
  onAborted: () => void;
}

/**
 * Run-scoped state only: abort controllers and reactive-compact retry counter.
 * Cross-service orchestration belongs on {@link ManagedAgent}.
 */
export class RunCoordinator {
  currentAbortController: AbortController | null = null;
  cancelAbortController: () => void = () => {};
  pendingAbortControllers: AbortController[] = [];
  private externalAbortListener: ((event: Event) => void) | null = null;
  private externalAbortSignal: AbortSignal | null = null;

  private reactiveCompactRetries = 0;

  setupAbortController(abortSignal: AbortSignal | undefined, setup: AbortControllerSetup): void {
    this.cancelAbortController();
    this.currentAbortController = new AbortController();

    const abortListener = () => setup.onAborted();
    this.currentAbortController.signal.addEventListener("abort", abortListener, { once: true });
    this.cancelAbortController = () => {
      this.currentAbortController?.signal.removeEventListener("abort", abortListener);
      if (this.externalAbortSignal && this.externalAbortListener) {
        this.externalAbortSignal.removeEventListener("abort", this.externalAbortListener);
      }
      this.externalAbortSignal = null;
      this.externalAbortListener = null;
    };

    if (abortSignal) {
      if (abortSignal.aborted) {
        let item = this.pendingAbortControllers.pop();
        while (item) {
          item.abort(abortSignal.reason);
          item = this.pendingAbortControllers.pop();
        }
        setTimeout(() => this.currentAbortController?.abort(abortSignal.reason));
      } else {
        const listener = (reason: Event) => {
          let item = this.pendingAbortControllers.pop();
          while (item) {
            item.abort(reason);
            item = this.pendingAbortControllers.pop();
          }
          setTimeout(() => this.currentAbortController?.abort(reason));
        };
        abortSignal.addEventListener("abort", listener);
        this.externalAbortSignal = abortSignal;
        this.externalAbortListener = listener;
      }
    }
  }

  addPendingAbortController(abortController: AbortController): void {
    this.pendingAbortControllers.push(abortController);
  }

  removePendingAbortController(abortController: AbortController): void {
    this.pendingAbortControllers = this.pendingAbortControllers.filter((ac) => ac !== abortController);
  }

  abort(reason?: unknown): void {
    let pending = this.pendingAbortControllers.pop();
    while (pending) {
      pending.abort(reason);
      pending = this.pendingAbortControllers.pop();
    }
    this.currentAbortController?.abort(reason);
  }

  isAbortError(err: unknown): boolean {
    if (err instanceof Error) return err.name === "AbortError" || err.message.includes("aborted");
    return false;
  }

  resetReactiveCompactRetries(): void {
    this.reactiveCompactRetries = 0;
  }

  canRetryReactiveCompact(): boolean {
    return this.reactiveCompactRetries < MAX_REACTIVE_RETRIES;
  }

  recordReactiveCompactRetry(): number {
    this.reactiveCompactRetries += 1;
    return this.reactiveCompactRetries;
  }

  getMaxReactiveCompactRetries(): number {
    return MAX_REACTIVE_RETRIES;
  }

  resetRunState(): void {
    this.abort();
    this.reactiveCompactRetries = 0;
    this.pendingAbortControllers = [];
    this.cancelAbortController();
    this.currentAbortController = null;
  }
}
