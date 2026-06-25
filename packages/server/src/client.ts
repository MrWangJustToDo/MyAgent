/**
 * Lightweight CoreEnv client that connects to a CoreEnv HTTP server via Hono RPC.
 *
 * Only imports `hono/client` and `@my-agent/core` types — no server dependencies.
 *
 * @example
 * ```typescript
 * import { registerCoreEnv } from "@my-agent/core";
 * import { createRemoteCoreEnv } from "@my-agent/server/client";
 *
 * const env = await createRemoteCoreEnv("http://localhost:3100");
 * registerCoreEnv(env);
 * ```
 */

import { ExecutionError, FileError, defaultPath } from "@my-agent/core";
import { hc } from "hono/client";

import type { AppType } from ".";
import type {
  CommandResult,
  CoreEnv,
  CoreEnvExecResult,
  CoreEnvFs,
  CoreEnvFsStat,
  CoreEnvPath,
  FileEntry,
  McpProcessHandle,
  McpStdioTransportConfig,
  RunCommandOptions,
} from "@my-agent/core";

type Client = ReturnType<typeof hc<AppType>>;

// ============================================================================
// Error Deserialization
// ============================================================================

interface ErrorPayload {
  error: true;
  name: string;
  code: string;
  message: string;
  path?: string;
}

function isErrorPayload(data: unknown): data is ErrorPayload {
  return typeof data === "object" && data !== null && (data as Record<string, unknown>).error === true;
}

function deserializeError(payload: ErrorPayload): Error {
  if (payload.name === "FileError") {
    return new FileError(payload.code as never, payload.message, payload.path);
  }
  if (payload.name === "ExecutionError") {
    return new ExecutionError(payload.code as never, payload.message);
  }
  return new Error(payload.message);
}

async function unwrap<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    if (isErrorPayload(payload)) throw deserializeError(payload);
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return (await response.json()) as T;
}

// ============================================================================
// Remote CoreEnvFs
// ============================================================================

function createRemoteFs(client: Client): CoreEnvFs {
  return {
    readFile: async (path: string, encoding?: string): Promise<string> => {
      const res = await client.fs.readFile.$post({ json: { path, encoding } });
      const data = await unwrap<{ content: string }>(res);
      return data.content;
    },

    readFileBuffer: async (path: string): Promise<Uint8Array> => {
      const res = await client.fs.readFileBuffer.$post({ json: { path } });
      const data = await unwrap<{ data: string }>(res);
      const binary = atob(data.data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    },

    stat: async (path: string): Promise<CoreEnvFsStat> => {
      const res = await client.fs.stat.$post({ json: { path } });
      const data = await unwrap<{ isDirectory: boolean; isFile: boolean; size: number; mtime: string }>(res);
      return { ...data, mtime: new Date(data.mtime) };
    },

    readdir: async (path: string): Promise<FileEntry[]> => {
      const res = await client.fs.readdir.$post({ json: { path } });
      const data = await unwrap<{
        entries: Array<{ name: string; type: "file" | "directory"; size?: number; modified?: string }>;
      }>(res);
      return data.entries.map((e) => ({
        name: e.name,
        type: e.type,
        size: e.size,
        modified: e.modified ? new Date(e.modified) : undefined,
      }));
    },

    writeFile: async (path: string, content: string): Promise<void> => {
      const res = await client.fs.writeFile.$post({ json: { path, content } });
      await unwrap(res);
    },

    mkdir: async (path: string): Promise<void> => {
      const res = await client.fs.mkdir.$post({ json: { path } });
      await unwrap(res);
    },

    exists: async (path: string): Promise<boolean> => {
      const res = await client.fs.exists.$post({ json: { path } });
      const data = await unwrap<{ exists: boolean }>(res);
      return data.exists;
    },

    remove: async (path: string): Promise<void> => {
      const res = await client.fs.remove.$post({ json: { path } });
      await unwrap(res);
    },

    appendFile: async (path: string, content: string): Promise<void> => {
      const res = await client.fs.appendFile.$post({ json: { path, content } });
      await unwrap(res);
    },
  };
}

// ============================================================================
// createRemoteCoreEnv
// ============================================================================

function serializeRunOptions(options?: RunCommandOptions) {
  if (!options) return undefined;
  const { onStdout: _, onStderr: __, ...rest } = options;
  return rest;
}

/**
 * Create a {@link CoreEnv} that delegates to a remote CoreEnv HTTP server via Hono RPC.
 *
 * Synchronous utilities (`path`, `byteLength`, `base64*`) use core defaults locally.
 * Only I/O operations (fs, commands, fetch) are proxied over HTTP.
 *
 * @param serverUrl - Base URL of the CoreEnv server (e.g. `"http://localhost:3100"`)
 */
export async function createRemoteCoreEnv(serverUrl: string): Promise<CoreEnv> {
  const baseUrl = serverUrl.replace(/\/+$/, "");
  const client = hc<AppType>(`${baseUrl}/api`);

  const infoRes = await client.env.info.$get();
  const info = await unwrap<{ rootPath: string; platform: string; arch: string; homedir: string; sep?: string }>(
    infoRes
  );

  const serverSep = info.sep || "/";
  const path: CoreEnvPath =
    serverSep === "/"
      ? defaultPath
      : {
          ...defaultPath,
          getSep: () => serverSep,
          isAbsolute: (p) => p.startsWith(serverSep) || defaultPath.isAbsolute(p),
        };

  // Track MCP stdio sessions created by this env, so getMCPTransportProcess
  // can issue a remote kill when the process manager cleans up.
  const transportSessions = new WeakMap<object, string>();

  return {
    rootPath: info.rootPath,

    path,

    getPlatform: async () => info.platform,
    getArch: async () => info.arch,
    getEnv: async () => {
      const res = await client.env.vars.$get();
      return await unwrap<Record<string, string | undefined>>(res);
    },
    homedir: async () => info.homedir,

    fs: createRemoteFs(client),

    runCommand: async (command: string, options?: RunCommandOptions): Promise<CommandResult> => {
      const res = await client.command.run.$post({ json: { command, options: serializeRunOptions(options) } });
      return await unwrap<CommandResult>(res);
    },

    exec: async (command: string, options?): Promise<CoreEnvExecResult> => {
      const res = await client.command.exec.$post({ json: { command, options } });
      return await unwrap<CoreEnvExecResult>(res);
    },

    fetch: async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = init?.method ?? (input instanceof Request ? input.method : undefined);
      const headers: Record<string, string> = {};
      const rawHeaders = init?.headers ?? (input instanceof Request ? input.headers : undefined);
      if (rawHeaders) {
        if (rawHeaders instanceof Headers) {
          rawHeaders.forEach((v, k) => {
            headers[k] = v;
          });
        } else if (Array.isArray(rawHeaders)) {
          for (const [k, v] of rawHeaders) headers[k] = v;
        } else {
          Object.assign(headers, rawHeaders);
        }
      }
      const body = typeof init?.body === "string" ? init.body : undefined;

      const res = await client.fetch.proxy.$post({
        json: { url, method, headers: Object.keys(headers).length > 0 ? headers : undefined, body },
      });
      const data = await unwrap<{
        status: number;
        statusText: string;
        headers: Record<string, string>;
        body: string;
        encoding?: "text" | "base64";
      }>(res);

      let responseBody: BodyInit;
      if (data.encoding === "base64") {
        const binary = atob(data.body);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        responseBody = bytes;
      } else {
        responseBody = data.body;
      }

      return new Response(responseBody, {
        status: data.status,
        statusText: data.statusText,
        headers: data.headers,
      });
    },

    getMimeType: async (filePath: string) => {
      const res = await client.fs.mimeType.$post({ json: { path: filePath } });
      const data = await unwrap<{ mimeType: string | false }>(res);
      return data.mimeType;
    },

    destroy: async () => {
      try {
        const res = await client.env.destroy.$post();
        await unwrap<{ ok: boolean }>(res);
      } catch {
        // Server may already be gone
      }
    },

    // =============================================================================
    // MCP Stdio Transport (proxy via HTTP to the remote server)
    // =============================================================================
    // We track transports in a WeakMap so getMCPTransportProcess can look up
    // the session ID and issue a remote cleanup.
    createMCPStdioTransport: (config: McpStdioTransportConfig) => {
      const apiUrl = `${baseUrl}/api/mcp`;

      // sessionId is stored in closure (not on the transport object) to keep
      // the transport shape compatible with @ai-sdk/mcp MCPTransport interface.
      let sessionId: string | null = null;

      // Helper: performs HTTP POST and dispatches responses via onmessage
      const performSend = async (sid: string, msg: unknown): Promise<void> => {
        const res = await fetch(`${apiUrl}/${sid}/message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: msg }),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`MCP message failed: ${res.status} ${text}`);
        }
        const data = await res.json();
        if (!data.responses) return;
        for (const response of data.responses as unknown[]) {
          transport.onmessage?.(response);
        }
      };

      const transport: {
        start(): Promise<void>;
        send(message: unknown): Promise<void>;
        close(): Promise<void>;
        onclose?: () => void;
        onerror?: (error: Error) => void;
        onmessage?: (message: unknown) => void;
      } = {
        async start() {
          const res = await fetch(`${apiUrl}/init`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(config),
          });
          if (!res.ok) {
            const text = await res.text();
            throw new Error(`MCP init failed: ${res.status} ${text}`);
          }
          const data = await res.json();
          sessionId = data.id;
          transportSessions.set(transport, data.id);
        },

        send(message: unknown): Promise<void> {
          // Send the message via HTTP. The returned promise:
          // - Resolves once the HTTP request completes (responses dispatched via onmessage)
          // - Rejects if the HTTP request fails (propagated to request() promise)
          // Errors are also forwarded to onerror for uncaught error handling.
          const sid = sessionId;
          if (!sid) throw new Error("MCP transport not started");
          const promise = performSend(sid, message);
          promise.catch((err: unknown) => {
            transport.onerror?.(err instanceof Error ? err : new Error(String(err)));
          });
          return promise;
        },

        async close() {
          const sid = sessionId;
          if (sid) {
            try {
              await fetch(`${apiUrl}/${sid}`, { method: "DELETE" });
            } catch {
              // Server may already be gone
            }
            sessionId = null;
          }
          transport.onclose?.();
        },
      };

      return transport;
    },

    getMCPTransportProcess: (transport: unknown): McpProcessHandle | undefined => {
      const sid = transportSessions.get(transport as object);
      if (!sid) return undefined;
      return {
        killed: false,
        kill: () => {
          fetch(`${baseUrl}/api/mcp/${sid}`, { method: "DELETE" }).catch(() => {});
          return true;
        },
      };
    },
  };
}
