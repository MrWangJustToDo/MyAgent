/**
 * Session-scoped switch to skip all `needsApproval` tool prompts (auto / YOLO mode).
 */

export class AutoApproveController {
  private enabled = false;

  constructor(private readonly onChange?: () => void) {}

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.onChange?.();
  }

  /** @returns new enabled state */
  toggle(): boolean {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }
}
