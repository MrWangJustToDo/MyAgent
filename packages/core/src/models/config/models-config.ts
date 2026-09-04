/**
 * Unified model configuration — the single source of truth for LLM settings.
 *
 * A `models.config` (JSON) file lives at `.agents/config/models.config` and has
 * two sections:
 * - `global`: runtime-only settings (maxIterations, mcpConfigPath, systemPrompt,
 *   toolConfig). Pure environment / server items (SERVER_PORT, ROOT_PATH, ...)
 *   stay in `.env`.
 * - `models[]`: a list of provider entries. Two kinds:
 *   - `direct`      — local keys + baseURL + optional `models[]` id list
 *   - `remote-provider` — a single server URL that holds keys / proxies traffic
 *
 * Local and remote hosts resolve this through ONE pipeline
 * ({@link resolveModelsConfig}): the only difference is where the raw config is
 * read from — a local file vs the server's `GET /api/provider/info`. The result
 * is loaded into memory ({@link loadModels}) and used to initialize the session.
 */

import { z } from "zod";

import { getEnv } from "../../env.js";
import { createDirectModelProvider, registerModelProvider } from "../provider/model-provider.js";
import { createRemoteProvider, REMOTE_PROVIDER_API_KEY } from "../provider/remote-model-provider.js";

import type { ModelInfo, ModelStyle } from "../types.js";

// ============================================================================
// Constants
// ============================================================================

export const MODELS_CONFIG_DIR = ".agents/config";
export const MODELS_CONFIG_FILE = "models.config";

// ============================================================================
// Zod schema
// ============================================================================

const modelStyleSchema = z.enum(["openai", "anthropic"]);

const globalSchema = z.object({
  maxIterations: z.number().int().positive().optional(),
  mcpConfigPath: z.string().min(1).optional(),
  systemPrompt: z.string().optional(),
  toolConfig: z
    .object({
      braveApiKey: z.string().optional(),
      websearchProvider: z.string().optional(),
    })
    .optional(),
});

const directEntrySchema = z.object({
  type: z.literal("direct"),
  style: modelStyleSchema,
  baseURL: z.string().min(1),
  apiKey: z.string().optional(),
  models: z.array(z.string().min(1)).optional(),
});

const remoteProviderEntrySchema = z.object({
  type: z.literal("remote-provider"),
  url: z.string().min(1),
});

const modelsConfigSchema = z.object({
  global: globalSchema.optional(),
  models: z.array(z.union([directEntrySchema, remoteProviderEntrySchema])).min(1),
  active: z
    .object({
      entryIndex: z.number().int().nonnegative(),
      model: z.string().optional(),
    })
    .optional(),
});

// ============================================================================
// Types
// ============================================================================

export interface ModelsConfigGlobal {
  maxIterations?: number;
  mcpConfigPath?: string;
  systemPrompt?: string;
  toolConfig?: { braveApiKey?: string; websearchProvider?: string };
}

export interface DirectModelsConfigEntry {
  type: "direct";
  style: ModelStyle;
  baseURL: string;
  apiKey?: string;
  models?: string[];
}

export interface RemoteProviderConfigEntry {
  type: "remote-provider";
  url: string;
}

export type ModelsConfigEntry = DirectModelsConfigEntry | RemoteProviderConfigEntry;

export interface ModelsConfigActive {
  /** Index into `models[]` of the last-used entry. */
  entryIndex: number;
  /** Last-used model id within that entry. */
  model?: string;
}

export interface ModelsConfig {
  global?: ModelsConfigGlobal;
  models: ModelsConfigEntry[];
  active?: ModelsConfigActive;
}

/** Loaded, validated config — the in-memory source for model resolution. */
export interface ModelsConfigSource {
  kind: "file" | "provider";
  /** File mode: `.agents/config/models.config` under this root (default: CoreEnv rootPath). */
  rootPath?: string;
  /** Provider mode: base URL exposing `GET /api/provider/info`. */
  serverUrl?: string;
}

/** A single resolved, selectable provider entry in memory. */
export interface LoadedModelEntry {
  type: "direct" | "remote";
  style: ModelStyle;
  baseURL: string;
  apiKey?: string;
  /** Selectable model ids (direct: `entry.models`; remote: server's list). */
  models: string[];
}

/** Fully-loaded models config: schema + per-entry connection + active selection. */
export interface LoadedModelsState {
  config: ModelsConfig;
  entries: LoadedModelEntry[];
  active: ModelsConfigActive;
}

/** Remote `/api/provider/info` shape returned by the server. */
export interface ProviderInfo {
  mode: "remote";
  style: ModelStyle;
  model: string;
  basePath: string;
  /** Server's own models.config (unified shape) — drives the selectable list. */
  config?: ModelsConfig;
}

// ============================================================================
// Parse / validate
// ============================================================================

export function parseModelsConfig(raw: string): ModelsConfig {
  const parsed = modelsConfigSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(`Invalid models.config: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data as ModelsConfig;
}

// ============================================================================
// File I/O (local mode)
// ============================================================================

export async function loadModelsConfigFromFile(rootPath?: string): Promise<ModelsConfig | null> {
  const env = getEnv();
  const base = rootPath ?? env.rootPath;
  const configPath = env.path.join(base, MODELS_CONFIG_DIR, MODELS_CONFIG_FILE);
  const exists = await env.fs.exists(configPath);
  if (!exists) return null;
  const raw = await env.fs.readFile(configPath);
  return parseModelsConfig(raw);
}

export async function saveModelsConfig(config: ModelsConfig, rootPath?: string): Promise<void> {
  const env = getEnv();
  const base = rootPath ?? env.rootPath;
  const dir = env.path.join(base, MODELS_CONFIG_DIR);
  const configPath = env.path.join(dir, MODELS_CONFIG_FILE);
  const dirExists = await env.fs.exists(dir);
  if (!dirExists) await env.fs.mkdir(dir);
  await env.fs.writeFile(configPath, JSON.stringify(config, null, 2));
}

// ============================================================================
// Remote provider info (server mode)
// ============================================================================

async function fetchProviderInfo(serverUrl: string): Promise<ProviderInfo> {
  const baseUrl = serverUrl.replace(/\/+$/, "");
  const res = await fetch(`${baseUrl}/api/provider/info`);
  if (!res.ok) {
    throw new Error(`Remote provider unavailable at ${baseUrl}/api/provider/info (HTTP ${res.status}).`);
  }
  const info = (await res.json()) as ProviderInfo;
  if (info.mode !== "remote" || !info.basePath || !info.style) {
    throw new Error(`Invalid provider info from ${baseUrl}/api/provider/info`);
  }
  return info;
}

export async function resolveModelsConfigFromProvider(serverUrl: string): Promise<ModelsConfig> {
  const info = await fetchProviderInfo(serverUrl);
  // Prefer the server's own models.config; fall back to a single direct entry
  // synthesized from its reported connection when it exposes no config.
  if (info.config?.models?.length) return info.config;
  return {
    models: [
      {
        type: "direct",
        style: info.style,
        baseURL: `${serverUrl.replace(/\/+$/, "")}${info.basePath}`,
        apiKey: REMOTE_PROVIDER_API_KEY,
        models: info.model ? [info.model] : [],
      },
    ],
  };
}

// ============================================================================
// Unified resolve
// ============================================================================

/**
 * Resolve the models config through one pipeline. Local and remote only differ
 * in where the raw config comes from — both produce the same {@link ModelsConfig}.
 *
 * @returns the config, or `null` when a local file mode config does not exist.
 */
export async function resolveModelsConfig(source: ModelsConfigSource): Promise<ModelsConfig | null> {
  if (source.kind === "provider" && source.serverUrl) {
    return resolveModelsConfigFromProvider(source.serverUrl);
  }
  return loadModelsConfigFromFile(source.rootPath);
}

// ============================================================================
// Load into memory
// ============================================================================

export async function loadModelEntries(config: ModelsConfig): Promise<LoadedModelEntry[]> {
  const entries: LoadedModelEntry[] = [];
  for (const entry of config.models) {
    if (entry.type === "direct") {
      entries.push({
        type: "direct",
        style: entry.style,
        baseURL: entry.baseURL,
        apiKey: entry.apiKey,
        models: entry.models ?? [],
      });
      continue;
    }
    // remote-provider: ask the server for its connection + selectable list.
    const info = await fetchProviderInfo(entry.url);
    const baseUrl = entry.url.replace(/\/+$/, "");
    const remoteModels =
      info.config?.models
        ?.filter((e): e is DirectModelsConfigEntry => e.type === "direct")
        .flatMap((e) => e.models ?? []) ?? (info.model ? [info.model] : []);
    entries.push({
      type: "remote",
      style: info.style,
      baseURL: `${baseUrl}${info.basePath}`,
      apiKey: REMOTE_PROVIDER_API_KEY,
      models: remoteModels,
    });
  }
  return entries;
}

/** Resolve + validate + load into memory, picking the active entry/model. */
export async function loadModels(source: ModelsConfigSource): Promise<LoadedModelsState | null> {
  const config = await resolveModelsConfig(source);
  if (!config) return null;
  const entries = await loadModelEntries(config);
  const active = config.active ?? { entryIndex: 0 };
  return { config, entries, active };
}

// ============================================================================
// Provider registration for an entry
// ============================================================================

/**
 * Register the model provider that corresponds to the active entry so agent
 * creation resolves models through it. Re-registering the module-level provider
 * at runtime is supported, which is what makes mid-session entry switches work.
 */
export async function registerModelProviderForEntry(state: LoadedModelsState): Promise<ModelStyle> {
  const entry = state.entries[state.active.entryIndex];
  if (!entry) throw new Error(`No model entry at index ${state.active.entryIndex}`);
  const configEntry = state.config.models[state.active.entryIndex];
  const activeModel = state.active.model ?? entry.models[0] ?? "";

  if (entry.type === "remote") {
    const url = configEntry?.type === "remote-provider" ? configEntry.url : "";
    registerModelProvider(await createRemoteProvider(url));
    return entry.style;
  }

  registerModelProvider(
    createDirectModelProvider({
      model: activeModel,
      style: entry.style,
      baseURL: entry.baseURL,
      apiKey: entry.apiKey,
    })
  );
  return entry.style;
}

/** Resolve modelInfo for a model id (via models.dev) — used by `/models` switching. */
export async function resolveModelInfoFromModelsDev(
  modelId: string,
  style?: ModelStyle
): Promise<ModelInfo | undefined> {
  const { lookupModelFromModelsDev } = await import("../provider/models-dev.js");
  return lookupModelFromModelsDev(modelId, style);
}
