import type { ExtensionAPI, ExtensionFactory, ExtensionConfig } from "./types.js";

export interface ExtensionManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  entry: string;
  config?: ExtensionConfig;
}

export interface ExtensionLoadResult {
  loaded: ExtensionAPI[];
  errors: Error[];
}

export class ExtensionLoader {
  private factories = new Map<string, ExtensionFactory>();

  registerFactory(id: string, factory: ExtensionFactory): void {
    this.factories.set(id, factory);
  }

  hasFactory(id: string): boolean {
    return this.factories.has(id);
  }

  async loadFromFactories(ids: string[]): Promise<ExtensionLoadResult> {
    const loaded: ExtensionAPI[] = [];
    const errors: Error[] = [];

    for (const id of ids) {
      const factory = this.factories.get(id);
      if (!factory) {
        errors.push(new Error(`Extension factory not found: ${id}`));
        continue;
      }

      try {
        const api = await factory.create();
        loaded.push(api);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        errors.push(error);
      }
    }

    return { loaded, errors };
  }

  async loadFromConfigs(ids: string[]): Promise<ExtensionLoadResult> {
    const registeredIds: string[] = [];
    for (const id of ids) {
      if (this.factories.has(id)) {
        registeredIds.push(id);
      }
    }
    return this.loadFromFactories(registeredIds);
  }
}
