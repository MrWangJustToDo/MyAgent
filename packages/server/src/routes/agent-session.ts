/**
 * Agent Session HTTP plane — same contract as LocalAgentSession (REST + SSE).
 * Distinct from CoreEnv workspace routes under `/api/fs`, `/api/command`, etc.
 *
 * Remount support: the server keeps per-agent tool output buffers (fed by the
 * session's own `tool` channel subscription) and serves summary-stream
 * snapshots so a reconnecting client can reconstruct in-flight state.
 *
 * Runtime imports from `@my-agent/core` are dynamic so server dts bundling does not
 * pull TanStack AI types into the CoreEnv server entry.
 */

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";

import { readServerModelEnv } from "./provider.js";

interface SummarySnapshotLike {
  key: string;
  [field: string]: unknown;
}

interface SessionLike {
  id: string;
  getSnapshot(): unknown;
  dispatch(command: unknown): Promise<unknown>;
  subscribe(
    handler: (event: { channel: string; payload?: unknown }) => void | Promise<void>,
    options?: { channels?: string[] }
  ): () => void;
  getSummaryStreamSnapshot?(key: string): SummarySnapshotLike | null;
  listSummaryStreamSnapshots?(): SummarySnapshotLike[];
}

const sessions = new Map<string, SessionLike>();

/** Per-agent tool output buffers for client remount (cap per stream). */
const TOOL_BUFFER_CAP_BYTES = 256 * 1024;
type ToolBuffer = { stdout: string; stderr: string };
const toolBuffers = new Map<string, Map<string, ToolBuffer>>();
const toolUnsubs = new Map<string, () => void>();

function appendCapped(current: string, chunk: string): string {
  const next = current + chunk;
  return next.length > TOOL_BUFFER_CAP_BYTES ? next.slice(next.length - TOOL_BUFFER_CAP_BYTES) : next;
}

function attachToolBuffer(id: string, session: SessionLike): void {
  if (toolUnsubs.has(id)) return;
  const buffers = new Map<string, ToolBuffer>();
  toolBuffers.set(id, buffers);
  toolUnsubs.set(
    id,
    session.subscribe((event) => {
      if (event.channel !== "tool") return;
      const payload = event.payload as
        | { kind: "chunk"; chunk: { toolCallId: string; type: "stdout" | "stderr"; chunk: string } }
        | { kind: "clear"; toolCallId: string }
        | undefined;
      if (!payload) return;
      if (payload.kind === "clear") {
        buffers.delete(payload.toolCallId);
        return;
      }
      const entry = buffers.get(payload.chunk.toolCallId) ?? { stdout: "", stderr: "" };
      if (payload.chunk.type === "stdout") entry.stdout = appendCapped(entry.stdout, payload.chunk.chunk);
      else entry.stderr = appendCapped(entry.stderr, payload.chunk.chunk);
      buffers.set(payload.chunk.toolCallId, entry);
    })
  );
}

function dropToolBuffer(id: string): void {
  toolUnsubs.get(id)?.();
  toolUnsubs.delete(id);
  toolBuffers.delete(id);
}

const createBodySchema = z.object({
  name: z.string().optional(),
  // Optional: when omitted (or empty), the server falls back to its own `.env`
  // provider so a `--remote-session` client needs no local keys or model.
  model: z.string().optional(),
  style: z.string().optional(),
  baseURL: z.string().optional(),
  apiKey: z.string().optional(),
  systemPrompt: z.string().optional(),
  maxIterations: z.number().int().positive().optional(),
  mcpConfigPath: z.string().optional(),
  extensionDirs: z.array(z.string()).optional(),
  continueSession: z.boolean().optional(),
  resumeSessionId: z.string().optional(),
});

async function loadCore() {
  return import("@my-agent/core");
}

async function getSession(id: string): Promise<SessionLike | undefined> {
  const existing = sessions.get(id);
  if (existing) return existing;
  const { agentManager, createLocalAgentSession } = await loadCore();
  const managed = agentManager.getAgent(id);
  if (!managed) return undefined;
  const session = createLocalAgentSession({ managed, manager: agentManager }) as unknown as SessionLike;
  sessions.set(id, session);
  attachToolBuffer(id, session);
  return session;
}

export const agentSessionRoutes = new Hono()
  // Catalog list — mirrors Local `AgentSessionHost.list()`.
  .get("/", async (c) => {
    const { agentManager } = await loadCore();
    const entries = agentManager.getAgents().map((managed) => ({
      agentId: managed.id,
      name: managed.name,
      ...(managed.parentId ? { parentId: managed.parentId } : {}),
      status: managed.status,
      createdAt: managed.createdAt,
      updatedAt: managed.updatedAt,
    }));
    return c.json({ agents: entries });
  })
  .post("/", async (c) => {
    const body = createBodySchema.parse(await c.req.json());
    const { agentManager, buildDefaultSystemPrompt, createLocalAgentSessionHost, resolveModelConfig } =
      await loadCore();
    // Explicit client model wins; otherwise use the server's own `.env` provider
    // so a `--remote-session` client can leave model configuration on the server.
    const explicitModel = body.model?.trim();
    const { connection, modelInfo } = explicitModel
      ? await resolveModelConfig({
          model: body.model,
          style: body.style as "openai" | "anthropic" | undefined,
          baseURL: body.baseURL,
          apiKey: body.apiKey,
        })
      : await resolveModelConfig(readServerModelEnv());
    if (!connection.model?.trim()) {
      return c.json(
        {
          error: true,
          message:
            "No model configured: pass `model` in the request body, or set MODEL / API_KEY / BASE_URL in the server .env (see --remote-session).",
        },
        400
      );
    }
    const host = createLocalAgentSessionHost({ manager: agentManager });
    const { session } = await host.create({
      name: body.name || "remote",
      model: connection.model,
      systemPrompt: body.systemPrompt || (await buildDefaultSystemPrompt()),
      maxIterations: body.maxIterations,
      mcpConfigPath: body.mcpConfigPath,
      extensionDirs: body.extensionDirs,
      modelStyle: connection.style,
      modelBaseURL: connection.baseURL,
      modelApiKey: connection.apiKey,
      modelInfo,
      continueSession: body.continueSession,
      resumeSessionId: body.resumeSessionId,
    });
    sessions.set(session.id, session as unknown as SessionLike);
    attachToolBuffer(session.id, session as unknown as SessionLike);
    return c.json({ id: session.id, snapshot: (session as SessionLike).getSnapshot() });
  })
  .get("/:id/snapshot", async (c) => {
    const session = await getSession(c.req.param("id"));
    if (!session) return c.json({ error: true, message: "Session not found" }, 404);
    return c.json(session.getSnapshot());
  })
  .get("/:id/summary-streams", async (c) => {
    const session = await getSession(c.req.param("id"));
    if (!session) return c.json({ error: true, message: "Session not found" }, 404);
    return c.json({ snapshots: session.listSummaryStreamSnapshots?.() ?? [] });
  })
  .get("/:id/tool-buffers", async (c) => {
    const id = c.req.param("id");
    const session = await getSession(id);
    if (!session) return c.json({ error: true, message: "Session not found" }, 404);
    return c.json({ buffers: Object.fromEntries(toolBuffers.get(id) ?? []) });
  })
  .post("/:id/command", async (c) => {
    const session = await getSession(c.req.param("id"));
    if (!session) return c.json({ error: true, message: "Session not found" }, 404);
    const command = await c.req.json();
    const result = await session.dispatch(command);
    return c.json(result);
  })
  .get("/:id/events", async (c) => {
    const session = await getSession(c.req.param("id"));
    if (!session) return c.json({ error: true, message: "Session not found" }, 404);

    const channelsParam = c.req.query("channels");
    const channels = channelsParam
      ? channelsParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;

    return streamSSE(c, async (stream) => {
      let closed = false;
      const unsub = session.subscribe(
        async (event) => {
          if (closed) return;
          await stream.writeSSE({
            event: event.channel,
            data: JSON.stringify(event),
          });
        },
        channels ? { channels } : undefined
      );

      stream.onAbort(() => {
        closed = true;
        unsub();
      });

      // Heartbeat: comment frames keep proxies from idling out the stream and
      // give the client a liveness signal (data-less blocks are ignored there).
      const heartbeat = setInterval(() => {
        if (!closed) void stream.writeSSE({ event: "ping", data: "" }).catch(() => {});
      }, 15_000);

      await new Promise<void>((resolve) => {
        stream.onAbort(() => resolve());
      });
      clearInterval(heartbeat);
      unsub();
    });
  })
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    sessions.delete(id);
    dropToolBuffer(id);
    const { agentManager } = await loadCore();
    if (agentManager.getAgent(id)) {
      agentManager.destroyAgent(id);
    }
    return c.json({ ok: true });
  });
