/**
 * LSP Manager — manages LSP server connections, one per language.
 *
 * Lazily starts servers on first use. Auto-detects language from file extension.
 * Connections are created via the host-provided `CoreEnv.createLspConnection`
 * factory (Node only); when absent, LSP tools degrade gracefully.
 */

import { getLanguageIdFromPath } from "./language-map.js";
import { pathToFileUri } from "./shared/format.js";
import { RESTART_INITIAL_BACKOFF_MS, RESTART_MAX_BACKOFF_MS, RESTART_MAX_ATTEMPTS } from "./shared/timing.js";

import type { LspConnection, LspServerConfig } from "./lsp-transport.js";

/** Minimal path helpers LspManager needs from the runtime host. */
export interface LspPathHelpers {
  join(...parts: string[]): string;
  resolve(...parts: string[]): string;
}

/** Minimal fs helpers LspManager needs from the runtime host. */
export interface LspFsHelpers {
  existsSync(p: string): boolean | Promise<boolean>;
  readFile(p: string, encoding: "utf-8"): Promise<string>;
}

export interface LspServerConfigRecord {
  command: string;
  args: string[];
  env?: Record<string, string>;
  /** LSP initializationOptions passed during the initialize handshake */
  initializationOptions?: Record<string, unknown>;
  /** Settings returned by workspace/configuration handler (keyed by section) */
  settings?: Record<string, unknown>;
}

/** Lifecycle callbacks for UI notifications. */
export interface LspManagerCallbacks {
  onServerStart?: (languageId: string, command: string) => void;
  onServerReady?: (languageId: string) => void;
  onServerError?: (languageId: string, error: string) => void;
  onServerCrash?: (languageId: string, restarting: boolean, attempt: number) => void;
}

/** Default server configurations for common languages. */
const DEFAULT_SERVERS: Record<string, LspServerConfigRecord> = {
  typescript: { command: "typescript-language-server", args: ["--stdio"] },
  javascript: { command: "typescript-language-server", args: ["--stdio"] },
  typescriptreact: { command: "typescript-language-server", args: ["--stdio"] },
  javascriptreact: { command: "typescript-language-server", args: ["--stdio"] },
  rust: { command: "rust-analyzer", args: [] },
  python: { command: "pyright-langserver", args: ["--stdio"] },
  go: { command: "gopls", args: ["serve"] },
  java: { command: "jdtls", args: [] },
};

export interface ServerStatus {
  languageId: string;
  command: string;
  running: boolean;
  diagnosticsCount: number;
}

/** A connected LSP client bound to one language. */
export interface LspClient {
  connection: LspConnection;
  languageId: string;
  command: string;
  /** Cached diagnostics per document URI. */
  diagnostics: Map<string, unknown[]>;
}

export class LspManager {
  private clients = new Map<string, LspClient>();
  private serverConfigs: Map<string, LspServerConfigRecord>;
  private rootDir: string;
  private startingServers = new Map<string, Promise<void>>();
  private callbacks: LspManagerCallbacks;
  private getConnection: (config: LspServerConfig) => LspConnection;
  private shuttingDown = false;
  private restartAttempts = new Map<string, number>();
  private restartBackoff = new Map<string, number>();
  private _lombokJarPath: string | null = null;
  private path: LspPathHelpers;
  private fs: LspFsHelpers;

  constructor(
    rootDir: string,
    getConnection: (config: LspServerConfig) => LspConnection,
    pathHelpers: LspPathHelpers,
    fsHelpers: LspFsHelpers,
    customConfigs?: Record<string, LspServerConfigRecord>,
    callbacks?: LspManagerCallbacks
  ) {
    this.rootDir = rootDir;
    this.getConnection = getConnection;
    this.path = pathHelpers;
    this.fs = fsHelpers;
    this.serverConfigs = new Map(Object.entries({ ...DEFAULT_SERVERS, ...customConfigs }));
    this.callbacks = callbacks ?? {};
  }

  /** Replace the connection factory (e.g. when CoreEnv changes). */
  setConnectionFactory(factory: (config: LspServerConfig) => LspConnection): void {
    this.getConnection = factory;
  }

  /** Update or add a server configuration. */
  setServerConfig(languageId: string, config: LspServerConfigRecord): void {
    this.serverConfigs.set(languageId, config);
  }

  /** All configured languages. */
  getConfiguredLanguages(): string[] {
    return [...this.serverConfigs.keys()];
  }

  /** Resolve a file path to a language ID. */
  getLanguageId(filePath: string): string | undefined {
    return getLanguageIdFromPath(filePath);
  }

  /** Get a file URI from a path. */
  getFileUri(filePath: string): string {
    return pathToFileUri(this.resolvePath(filePath));
  }

  /** Resolve an absolute path from potentially relative input. */
  resolvePath(filePath: string): string {
    if (this.rootDir) {
      return this.path.resolve(this.rootDir, filePath);
    }
    return filePath;
  }

  /** Get the client for a language ONLY if already running. */
  getRunningClient(languageId: string): LspClient | null {
    const existing = this.clients.get(languageId);
    if (existing && existing.connection.initialized && !existing.connection.disposed) {
      return existing;
    }
    return null;
  }

  /** Get the client for a file, starting the server if needed. */
  async getClientForFile(filePath: string): Promise<LspClient | null> {
    const languageId = this.getLanguageId(filePath);
    if (!languageId) return null;
    return this.getClientForLanguage(languageId);
  }

  /** User-friendly message about why no client is available for a file. */
  getUnavailableReason(filePath: string): string {
    const languageId = this.getLanguageId(filePath);
    if (!languageId) {
      return `No LSP server configured for file type: ${filePath}`;
    }
    const waitHint = this.getExpectedStartTime(languageId);
    if (this.startingServers.has(languageId)) {
      return `LSP server for ${languageId} is starting. ${waitHint} Retry shortly.`;
    }
    return `No LSP server available for: ${filePath}. If you just opened this project, call any LSP tool on a file to trigger server startup.`;
  }

  /** Estimated startup time hint for a language server. */
  private getExpectedStartTime(languageId: string): string {
    switch (languageId) {
      case "java":
        return "This typically takes 1-5 minutes for Java (project indexing).";
      case "rust":
        return "This typically takes 30s-2min for Rust (cargo metadata + indexing).";
      case "typescript":
      case "javascript":
      case "typescriptreact":
      case "javascriptreact":
        return "This typically takes 10-30s for TypeScript/JavaScript.";
      case "python":
        return "This typically takes 10-30s for Python.";
      case "go":
        return "This typically takes 10-30s for Go.";
      default:
        return "This may take a few seconds to a minute.";
    }
  }

  /** Is a server currently starting up for a language? */
  isServerStarting(languageId: string): boolean {
    return this.startingServers.has(languageId);
  }

  /** Get the client for a language, starting the server if needed. */
  async getClientForLanguage(languageId: string): Promise<LspClient | null> {
    // Already running?
    const existing = this.clients.get(languageId);
    if (existing && existing.connection.initialized && !existing.connection.disposed) {
      return existing;
    }

    // Already starting? Don't block — return null so tools show "starting" message.
    const starting = this.startingServers.get(languageId);
    if (starting) return null;

    const config = this.serverConfigs.get(languageId);
    if (!config) return null;

    // Kick off server start in the background.
    const startPromise = this.startServer(languageId, config);
    this.startingServers.set(languageId, startPromise);
    startPromise.catch((err) => {
      this.startingServers.delete(languageId);
      const message = err instanceof Error ? err.message : String(err);
      this.callbacks.onServerError?.(languageId, message);
    });

    return null; // Server not ready yet
  }

  /** Eagerly start servers for the given languages (fire-and-forget). */
  startEagerly(languageIds: string[]): void {
    for (const languageId of languageIds) {
      const existing = this.clients.get(languageId);
      if (existing && existing.connection.initialized && !existing.connection.disposed) continue;
      if (this.startingServers.has(languageId)) continue;

      const config = this.serverConfigs.get(languageId);
      if (!config) continue;

      const startPromise = this.startServer(languageId, config);
      this.startingServers.set(languageId, startPromise);
      startPromise.catch((err) => {
        this.startingServers.delete(languageId);
        const message = err instanceof Error ? err.message : String(err);
        this.callbacks.onServerError?.(languageId, `Auto-start failed: ${message}`);
      });
    }
  }

  /** Build the config for creating a connection. */
  private buildConnectionConfig(languageId: string, config: LspServerConfigRecord): LspServerConfig {
    return {
      command: config.command,
      args: config.args,
      env: config.env,
      cwd: this.rootDir,
      initializationOptions: config.initializationOptions,
      settings: config.settings,
    };
  }

  private async startServer(languageId: string, config: LspServerConfigRecord): Promise<void> {
    const connConfig = this.buildConnectionConfig(languageId, config);
    const onUnexpectedExit = (code: number | null) => this.handleUnexpectedExit(languageId, code);

    this.callbacks.onServerStart?.(languageId, config.command);

    const connection = this.getConnection(connConfig);
    connection.onUnexpectedExit(onUnexpectedExit);
    connection.onPublishDiagnostics((uri, diagnostics) => {
      const client = this.clients.get(languageId);
      if (client) {
        client.diagnostics.set(uri, diagnostics);
      }
    });

    try {
      await connection.start();
      const client: LspClient = {
        connection,
        languageId,
        command: config.command,
        diagnostics: new Map(),
      };
      // If a shutdown began while we were initializing, do not register the
      // client — tear the freshly-started connection down immediately instead.
      // Otherwise it would leak as a live child process until the next
      // session:shutdown (which may never come).
      if (this.shuttingDown) {
        connection.shutdown().catch(() => {});
        this.startingServers.delete(languageId);
        this.callbacks.onServerError?.(languageId, `LSP server for ${languageId} shut down during startup`);
        return;
      }
      this.clients.set(languageId, client);
      this.startingServers.delete(languageId);
      this.callbacks.onServerReady?.(languageId);
      this.restartAttempts.delete(languageId);
      this.restartBackoff.delete(languageId);
      this.triggerPostInit(languageId, client);
    } catch (err) {
      this.startingServers.delete(languageId);
      const message = err instanceof Error ? err.message : String(err);
      this.callbacks.onServerError?.(
        languageId,
        `Failed to start LSP server for ${languageId} (${config.command}): ${message}`
      );
      throw err instanceof Error ? err : new Error(message);
    }
  }

  /** Post-initialization hook for language-specific setup (e.g. Java build). */
  private triggerPostInit(languageId: string, client: LspClient): void {
    if (languageId === "java") {
      // java/buildWorkspace forces jdtls to rebuild and re-publish diagnostics.
      client.connection.sendRequest("java/buildWorkspace", true).catch(() => {
        // Not critical — diagnostics will just be stale until a file changes
      });
    }
  }

  /** Get status of all configured/running servers. */
  getStatus(): ServerStatus[] {
    const statuses: ServerStatus[] = [];
    for (const [languageId, config] of this.serverConfigs) {
      const client = this.clients.get(languageId);
      let diagnosticsCount = 0;
      if (client) {
        for (const diags of client.diagnostics.values()) {
          diagnosticsCount += diags.length;
        }
      }
      statuses.push({
        languageId,
        command: config.command,
        running: client?.connection.initialized === true && !client.connection.disposed,
        diagnosticsCount,
      });
    }
    return statuses;
  }

  /** Handle an unexpected server exit — auto-restart with exponential backoff. */
  private handleUnexpectedExit(languageId: string, _code: number | null): void {
    if (this.shuttingDown) return;

    this.clients.delete(languageId);
    this.startingServers.delete(languageId);

    const attempts = this.restartAttempts.get(languageId) ?? 0;
    if (attempts >= RESTART_MAX_ATTEMPTS) {
      this.callbacks.onServerError?.(
        languageId,
        `LSP server for ${languageId} crashed ${attempts} times — giving up auto-restart`
      );
      this.callbacks.onServerCrash?.(languageId, false, attempts);
      return;
    }

    const backoff = this.restartBackoff.get(languageId) ?? RESTART_INITIAL_BACKOFF_MS;
    this.restartAttempts.set(languageId, attempts + 1);
    this.restartBackoff.set(languageId, Math.min(backoff * 2, RESTART_MAX_BACKOFF_MS));

    this.callbacks.onServerCrash?.(languageId, true, attempts + 1);

    setTimeout(() => {
      if (this.shuttingDown) return;
      const config = this.serverConfigs.get(languageId);
      if (!config) return;

      const startPromise = this.startServer(languageId, config);
      this.startingServers.set(languageId, startPromise);
      startPromise.catch((err) => {
        this.startingServers.delete(languageId);
        const message = err instanceof Error ? err.message : String(err);
        this.callbacks.onServerError?.(languageId, `Auto-restart failed for ${languageId}: ${message}`);
        this.handleUnexpectedExit(languageId, null);
      });
    }, backoff);
  }

  /** Shut down all clients AND any servers still mid-startup. */
  async shutdownAll(): Promise<void> {
    this.shuttingDown = true;

    // Shut down fully-registered clients.
    const shutdowns = [...this.clients.values()].map((client) => client.connection.shutdown().catch(() => {}));

    // Servers still in `startingServers` are not yet in `clients`; if a startup
    // was mid-handshake, `startServer` will detect `shuttingDown` once the
    // handshake resolves and tear itself down. Wait for those promises so no
    // child process is left behind.
    const startingPromises = [...this.startingServers.values()].map((p) => p.catch(() => {}));

    await Promise.all([...shutdowns, ...startingPromises]);
    this.clients.clear();
    this.startingServers.clear();
    this.shuttingDown = false;
  }

  /** Restart a specific language server. */
  async restartServer(languageId: string): Promise<void> {
    const existing = this.clients.get(languageId);
    if (existing) {
      await existing.connection.shutdown().catch(() => {});
      this.clients.delete(languageId);
    }

    const pending = this.startingServers.get(languageId);
    if (pending) {
      await pending.catch(() => {});
      this.startingServers.delete(languageId);
    }

    const config = this.serverConfigs.get(languageId);
    if (!config) throw new Error(`No server configured for ${languageId}`);

    await this.startServer(languageId, config);
  }

  /** Set an explicit Lombok jar path (Java jdtls support). */
  setLombokJar(jarPath: string): void {
    this._lombokJarPath = jarPath;
  }

  /** Get the currently configured Lombok jar path (if any). */
  async getLombokJar(): Promise<string | null> {
    if (!this._lombokJarPath) return null;
    const ok = await this.fs.existsSync(this._lombokJarPath);
    return ok ? this._lombokJarPath : null;
  }

  /** Read a file's text content if it exists and is readable; null otherwise. */
  async readFileIfPossible(filePath: string): Promise<string | null> {
    const absPath = this.resolvePath(filePath);
    const ok = await this.fs.existsSync(absPath);
    if (!ok) return null;
    try {
      return await this.fs.readFile(absPath, "utf-8");
    } catch {
      return null;
    }
  }

  /** Get cached diagnostics for a file URI (empty array if none). */
  getDiagnostics(filePathOrUri: string): unknown[] {
    const uri = filePathOrUri.startsWith("file:") ? filePathOrUri : this.getFileUri(filePathOrUri);
    const client = this.getRunningClient(this.getLanguageIdFromUri(uri));
    if (!client) return [];
    return client.diagnostics.get(uri) ?? [];
  }

  /** Compute a path relative to the project root (POSIX-style, no node:path). */
  pathRelative(filePath: string): string {
    const abs = this.resolvePath(filePath);
    if (abs.startsWith(this.rootDir)) {
      return abs.slice(this.rootDir.length).replace(/^[/\\]/, "") || ".";
    }
    return abs;
  }

  /** Infer language id from a file:// URI (best-effort). */
  private getLanguageIdFromUri(uri: string): string {
    const pathPart = uri.replace(/^file:\/\//, "");
    return this.getLanguageId(pathPart) ?? "";
  }
}
