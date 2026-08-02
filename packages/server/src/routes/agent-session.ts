/**
 * Agent Session HTTP plane — same contract as LocalAgentSession (REST + SSE).
 * Distinct from CoreEnv workspace routes under `/api/fs`, `/api/command`, etc.
 *
 * Runtime imports from `@my-agent/core` are dynamic so server dts bundling does not
 * pull TanStack AI types into the CoreEnv server entry.
 */

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";

interface SessionLike {
  id: string;
  getSnapshot(): unknown;
  dispatch(command: unknown): Promise<unknown>;
  subscribe(
    handler: (event: { channel: string }) => void | Promise<void>,
    options?: { channels?: string[] }
  ): () => void;
}

const sessions = new Map<string, SessionLike>();

const createBodySchema = z.object({
  model: z.string().min(1),
  style: z.string().optional(),
  baseURL: z.string().optional(),
  apiKey: z.string().optional(),
  name: z.string().optional(),
  systemPrompt: z.string().optional(),
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
  const session = createLocalAgentSession({ managed, manager: agentManager }) as SessionLike;
  sessions.set(id, session);
  return session;
}

export const agentSessionRoutes = new Hono()
  .post("/", async (c) => {
    const body = createBodySchema.parse(await c.req.json());
    const { agentManager, buildDefaultSystemPrompt, createLocalAgentSession, resolveModelConfig } = await loadCore();
    const { connection, modelInfo } = await resolveModelConfig({
      model: body.model,
      style: body.style as "openai" | "anthropic" | undefined,
      baseURL: body.baseURL,
      apiKey: body.apiKey,
    });
    const managed = await agentManager.createManagedAgent({
      modelInfo,
      model: connection.model,
      name: body.name || "remote",
      systemPrompt: body.systemPrompt || (await buildDefaultSystemPrompt()),
      maxIterations: 50,
      modelStyle: connection.style,
      modelBaseURL: connection.baseURL,
      modelApiKey: connection.apiKey,
    });
    managed.initChat(agentManager, []);
    const session = createLocalAgentSession({ managed, manager: agentManager }) as SessionLike;
    sessions.set(session.id, session);
    return c.json({ id: session.id, snapshot: session.getSnapshot() });
  })
  .get("/:id/snapshot", async (c) => {
    const session = await getSession(c.req.param("id"));
    if (!session) return c.json({ error: true, message: "Session not found" }, 404);
    return c.json(session.getSnapshot());
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

      await new Promise<void>((resolve) => {
        stream.onAbort(() => resolve());
      });
      unsub();
    });
  })
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    sessions.delete(id);
    const { agentManager } = await loadCore();
    if (agentManager.getAgent(id)) {
      agentManager.destroyAgent(id);
    }
    return c.json({ ok: true });
  });
