/**
 * Remote AgentSessionHost — implements the Host catalog surface
 * (create / connect / list / destroy) over the `/api/agent` HTTP plane.
 *
 * The host process constructs this when `--remote-session` is configured and
 * injects it into `createAgentFromConfig`; the UI layer stays Session-only.
 */

import { RemoteSessionClient } from "./remote-session-client.js";

import type { AgentSessionHost, AgentSessionSnapshot } from "@my-agent/core";

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

export interface RemoteAgentSessionHostOptions {
  baseUrl: string;
}

/**
 * Create a remote {@link AgentSessionHost} bound to an agent server.
 *
 * @param options.baseUrl - Agent server base URL (e.g. `"http://localhost:3100"`).
 */
export function createRemoteAgentSessionHost(options: RemoteAgentSessionHostOptions): AgentSessionHost {
  const client = (agentId: string): RemoteSessionClient =>
    new RemoteSessionClient({ baseUrl: options.baseUrl, agentId });

  return {
    async create(createOptions) {
      const response = await fetch(joinUrl(options.baseUrl, "/api/agent"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createOptions.name,
          model: createOptions.model,
          style: createOptions.modelStyle,
          baseURL: createOptions.modelBaseURL,
          apiKey: createOptions.modelApiKey,
          systemPrompt: createOptions.systemPrompt,
          maxIterations: createOptions.maxIterations,
          mcpConfigPath: createOptions.mcpConfigPath,
          extensionDirs: createOptions.extensionDirs,
          continueSession: createOptions.continueSession,
          resumeSessionId: createOptions.resumeSessionId,
        }),
      });
      if (!response.ok) {
        // Surface the server's real error (e.g. 400 "No model configured")
        // instead of silently reading `data.id` as undefined, which would turn
        // every later call into a misleading 404 "Session not found".
        const text = await response.text().catch(() => "");
        let detail = text || response.statusText;
        try {
          const body = JSON.parse(text) as { message?: string };
          if (body.message) detail = body.message;
        } catch {
          // keep raw text
        }
        throw new Error(`Failed to create remote agent session (HTTP ${response.status}): ${detail}`);
      }
      const data = (await response.json()) as { id: string; snapshot: AgentSessionSnapshot };
      return {
        session: new RemoteSessionClient({
          baseUrl: options.baseUrl,
          agentId: data.id,
          initialSnapshot: data.snapshot,
        }),
      };
    },

    connect(agentId) {
      // Synchronous contract like the Local host — hydrate lazily; snapshot
      // failures surface on first use (getSnapshot returns a shell until then).
      const session = client(agentId);
      void session.refresh().catch(() => {});
      return session;
    },

    async list() {
      const response = await fetch(joinUrl(options.baseUrl, "/api/agent"));
      const data = await readJson<{ agents: ReturnType<AgentSessionHost["list"]> }>(response);
      return data.agents;
    },

    async destroy(agentId) {
      await fetch(joinUrl(options.baseUrl, `/api/agent/${agentId}`), { method: "DELETE" });
    },
  };
}
