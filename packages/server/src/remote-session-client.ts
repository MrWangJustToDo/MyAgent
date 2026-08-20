/**
 * HTTP client implementing {@link AgentSession} (REST + SSE).
 * Keeps a local snapshot cache so `getSnapshot()` stays synchronous like Local.
 */

import type {
  AgentSession,
  AgentSessionCommand,
  AgentSessionCommandResult,
  AgentSessionEvent,
  AgentSessionSnapshot,
  AgentSessionSubscribeOptions,
  AgentSessionSubscriber,
  SummaryStreamSnapshot,
} from "@my-agent/core";

export interface RemoteSessionClientOptions {
  baseUrl: string;
  agentId: string;
  initialSnapshot: AgentSessionSnapshot;
  fetchImpl?: typeof fetch;
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, "")}${path}`;
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
  }
  return (await response.json()) as T;
}

function applyEvent(snapshot: AgentSessionSnapshot, event: AgentSessionEvent): AgentSessionSnapshot {
  switch (event.channel) {
    case "state":
      return {
        ...snapshot,
        status: event.payload.status,
        error: event.payload.error,
        pendingApprovalCount: event.payload.pendingApprovalCount,
      };
    case "messages":
      return { ...snapshot, messages: event.payload };
    case "queues":
      return { ...snapshot, queues: event.payload };
    case "usage":
      return { ...snapshot, usage: event.payload };
    case "todos":
      return { ...snapshot, todos: event.payload.items, todosTitle: event.payload.title };
    case "plan":
      return { ...snapshot, plan: event.payload };
    default:
      return snapshot;
  }
}

/**
 * Bind to an existing remote agent id (fetches initial snapshot).
 */
export async function connectRemoteSession(
  baseUrl: string,
  agentId: string,
  fetchImpl: typeof fetch = fetch
): Promise<RemoteSessionClient> {
  const response = await fetchImpl(joinUrl(baseUrl, `/api/agent/${agentId}/snapshot`));
  const initialSnapshot = await readJson<AgentSessionSnapshot>(response);
  return new RemoteSessionClient({ baseUrl, agentId, initialSnapshot, fetchImpl });
}

/**
 * Create a remote agent session and return a client bound to its id.
 */
export async function createRemoteSession(
  baseUrl: string,
  body: {
    model: string;
    style?: "openai" | "anthropic";
    baseURL?: string;
    apiKey?: string;
    name?: string;
    systemPrompt?: string;
  },
  fetchImpl: typeof fetch = fetch
): Promise<RemoteSessionClient> {
  const response = await fetchImpl(joinUrl(baseUrl, "/api/agent"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await readJson<{ id: string; snapshot: AgentSessionSnapshot }>(response);
  return new RemoteSessionClient({
    baseUrl,
    agentId: data.id,
    initialSnapshot: data.snapshot,
    fetchImpl,
  });
}

export class RemoteSessionClient implements AgentSession {
  readonly id: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private snapshot: AgentSessionSnapshot;

  constructor(options: RemoteSessionClientOptions) {
    this.id = options.agentId;
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.snapshot = options.initialSnapshot;
  }

  getSnapshot(): AgentSessionSnapshot {
    return this.snapshot;
  }

  getSummaryStreamSnapshot(_key: string): SummaryStreamSnapshot | null {
    return null;
  }

  async dispatch(command: AgentSessionCommand): Promise<AgentSessionCommandResult> {
    const response = await this.fetchImpl(joinUrl(this.baseUrl, `/api/agent/${this.id}/command`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(command),
    });
    const result = await readJson<AgentSessionCommandResult>(response);
    // Refresh snapshot after command so sync getSnapshot stays current.
    const snapRes = await this.fetchImpl(joinUrl(this.baseUrl, `/api/agent/${this.id}/snapshot`));
    this.snapshot = await readJson<AgentSessionSnapshot>(snapRes);
    return result;
  }

  subscribe(handler: AgentSessionSubscriber, options?: AgentSessionSubscribeOptions): () => void {
    const channels = options?.channels?.length ? `?channels=${options.channels.join(",")}` : "";
    const url = joinUrl(this.baseUrl, `/api/agent/${this.id}/events${channels}`);
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await this.fetchImpl(url, {
          headers: { Accept: "text/event-stream" },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          throw new Error(`SSE failed: HTTP ${response.status}`);
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!controller.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            const event = parseSseBlock(part);
            if (!event) continue;
            this.snapshot = applyEvent(this.snapshot, event);
            handler(event);
          }
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("[RemoteSessionClient] SSE error", error);
      }
    })();

    return () => {
      controller.abort();
    };
  }

  async close(): Promise<void> {
    await this.fetchImpl(joinUrl(this.baseUrl, `/api/agent/${this.id}`), { method: "DELETE" });
  }
}

function parseSseBlock(block: string): AgentSessionEvent | null {
  let data = "";
  for (const line of block.split("\n")) {
    if (line.startsWith("data:")) {
      data += line.slice(5).trim();
    }
  }
  if (!data) return null;
  try {
    return JSON.parse(data) as AgentSessionEvent;
  } catch {
    return null;
  }
}

/** @internal Exported for validate:agent-session-http */
export function parseAgentSessionSseBlockForTests(block: string): AgentSessionEvent | null {
  return parseSseBlock(block);
}
