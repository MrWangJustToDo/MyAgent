/**
 * Registry for tool result-to-UI-string renderers.
 * Parallel to toModelOutputRegistry but for client-side rendering.
 */
const toUIRegistry = new Map<string, (result: unknown) => string>();

export function registerToUI(toolName: string, renderer: (result: unknown) => string): void {
  toUIRegistry.set(toolName, renderer);
}

export function getToUI(toolName: string): ((result: unknown) => string) | undefined {
  return toUIRegistry.get(toolName);
}

export function clearToUI(): void {
  toUIRegistry.clear();
}
