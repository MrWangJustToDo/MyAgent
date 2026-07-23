import {
  createCompactionMiddleware,
  createExtensionsMiddleware,
  createLifecycleMiddleware,
  createPlanModeMiddleware,
  createStatusMiddleware,
  createToolCompactMiddleware,
  createTurnContextMiddleware,
} from "../agent/middleware";
import { getPlanModeToolExcludeSet } from "../agent/plan/plan-tools.js";
import { AgentRunner } from "../agent/runner/agent-runner.js";
import { resolveToolsRecord, SUBAGENT_EXCLUDED_TOOL_NAMES } from "../agent/tools/tanstack";
import { assertAsyncIterable } from "../agent/utils/assert-async-iterable.js";
import { createTextAdapter } from "../models/adapter-factory.js";
import { DEFAULT_BASE_URLS } from "../models/model-config.js";

import { AgentUIChannel } from "./agent-ui-channel.js";
import { createEmitFn } from "./emit-agent-event.js";
import { buildManagedAgentDeps } from "./managed-agent-deps.js";
import { runStreamWithRecovery } from "./reactive-compact-retry.js";

import type { AgentRunDeps } from "./agent-run-deps.js";
import type { ManagedAgent } from "./managed-agent.js";
import type { AgentManager } from "./manager-agent.js";
import type { TextAdapterConfig } from "../models/adapter-factory.js";
import type { ModelMessage, ServerTool, StreamChunk, UIMessage } from "@tanstack/ai";

// ============================================================================
// Run message selection
// ============================================================================

// ============================================================================
// Types
// ============================================================================

export interface RunAgentStreamInput {
  messages?: Array<UIMessage | ModelMessage>;
  data?: Record<string, unknown>;
  forwardedProps?: Record<string, unknown>;
  prompt?: string;
  abortSignal?: AbortSignal;
  threadId?: string;
  runId?: string;
  parentRunId?: string;
}

export interface RunAgentOptions {
  bridgeUI?: boolean;
  parentAgentId?: string;
  parentTaskToolCallId?: string;
}

// ============================================================================
// Text adapter resolution
// ============================================================================

export async function resolveTextAdapterForManaged(managed: ManagedAgent): Promise<TextAdapterConfig> {
  if (managed.textAdapter) return managed.textAdapter;

  const { config } = managed;
  const style = config.modelStyle;
  if (!style) {
    throw new Error(
      `Agent "${managed.id}" has no modelStyle configured. Set modelStyle, modelBaseURL, and modelApiKey on createManagedAgent().`
    );
  }

  managed.textAdapter = createTextAdapter({
    style,
    model: config.model,
    baseURL: config.modelBaseURL ?? DEFAULT_BASE_URLS[style],
    apiKey: config.modelApiKey,
  });
  return managed.textAdapter;
}

// ============================================================================
// TanStack tools
// ============================================================================

function resolveTanStackTools(managed: ManagedAgent): ServerTool[] {
  if (managed.parentId) {
    return resolveToolsRecord(managed.tools, { exclude: SUBAGENT_EXCLUDED_TOOL_NAMES }) as ServerTool[];
  }
  if (managed.planMode.isRestrictingTools()) {
    return resolveToolsRecord(managed.tools, {
      exclude: getPlanModeToolExcludeSet(managed.tools),
    }) as ServerTool[];
  }
  return resolveToolsRecord(managed.tools) as ServerTool[];
}

function buildRunDeps(managed: ManagedAgent, manager: AgentManager): AgentRunDeps {
  return buildManagedAgentDeps(managed, manager);
}

// ============================================================================
// AgentRunner factory
// ============================================================================

export function buildAgentRunner(
  managed: ManagedAgent,
  textAdapter: TextAdapterConfig,
  manager: AgentManager
): AgentRunner {
  const deps = buildRunDeps(managed, manager);
  const systemPrompt = managed.getSystemPrompt();
  const emitEvent = createEmitFn(managed);

  const middleware = [
    createStatusMiddleware({
      status: managed.statusController,
    }),
    createLifecycleMiddleware({
      usage: deps.usage,
      getPricing: () => deps.usage.getPricing(),
      onThinking: () => emitEvent("agent:thinking"),
      onFirstModelOutput: () => deps.memory.commitSurfacedMemories(),
      onRunFinalize: (reason) => managed.finalizeRun(manager, reason),
      emitEvent,
    }),
    createCompactionMiddleware({
      agentId: deps.agentId,
      manager: deps.manager,
      getCompactionConfig: () => deps.compactionConfig,
      getContext: () => deps.context,
      getUsage: () => deps.usage,
      getTodoManager: () => deps.todoManager,
      shouldTriggerAutoCompact: deps.shouldTriggerAutoCompact,
      status: managed.statusController,
      log: deps.log,
      emitEvent,
    }),
    createToolCompactMiddleware({
      getCompactionConfig: () => deps.compactionConfig,
      getToolCompactCache: () => managed.getToolCompactCache(),
      getManagedAgent: () => managed,
      log: deps.log,
    }),
    createTurnContextMiddleware({
      getFrozenSystemPrompt: deps.getFrozenSystemPrompt,
      getTurnContextSnapshot: deps.getTurnContextSnapshot,
    }),
    createExtensionsMiddleware({
      getExtensionRunner: () => deps.extensionRunner,
      getSessionId: () => deps.session.getSessionData()?.id ?? deps.agentId,
      getTodoManager: () => deps.todoManager,
      emitEvent,
    }),
    createPlanModeMiddleware({
      getPlanMode: () => managed.planMode,
    }),
  ];

  const maxOutputTokens = managed.getConfig().maxTokens ?? deps.modelInfo?.defaultMaxTokens;

  return new AgentRunner({
    adapter: textAdapter.adapter,
    model: textAdapter.model,
    maxIterations: managed.config.maxIterations ?? 10,
    systemPrompts: systemPrompt ? [systemPrompt] : undefined,
    tools: resolveTanStackTools(managed),
    middleware,
    temperature: managed.config.temperature,
    maxOutputTokens,
  });
}

function runnerConfigKey(managed: ManagedAgent): string {
  return JSON.stringify({
    tools: Object.keys(managed.tools).sort(),
    model: managed.config.model,
    maxIterations: managed.config.maxIterations,
    temperature: managed.config.temperature,
    modelStyle: managed.config.modelStyle,
    modelBaseURL: managed.config.modelBaseURL,
    // Rebuild when plan mode hides/restores tools
    planPhase: managed.planMode.getPhase(),
  });
}

export async function ensureAgentRunner(_manager: AgentManager, managed: ManagedAgent): Promise<AgentRunner> {
  const textAdapter = await resolveTextAdapterForManaged(managed);
  const configKey = runnerConfigKey(managed);

  if (managed.runner && managed.runnerConfigKey === configKey) {
    return managed.runner;
  }

  managed.runnerConfigKey = configKey;
  managed.runner = buildAgentRunner(managed, textAdapter, _manager);
  return managed.runner;
}

// ============================================================================
// runAgentStream / runAgent
// ============================================================================

async function executeManagedAgentRun(
  manager: AgentManager,
  agentId: string,
  input: RunAgentStreamInput
): Promise<AsyncIterable<StreamChunk>> {
  const managed = manager.getAgent(agentId);
  if (!managed) throw new Error(`Agent not found: ${agentId}`);

  const runner = await ensureAgentRunner(manager, managed);

  let messages = input.messages;
  if (input.prompt && !messages) {
    messages = [{ role: "user", content: input.prompt }];
  }

  await managed.prepareForRun({
    messages: messages as Parameters<typeof managed.prepareForRun>[0]["messages"],
    prompt: input.prompt,
    abortSignal: input.abortSignal,
  });

  // Use the RunCoordinator controller created in prepareForRun so ManagedAgent.abort()
  // cancels the same AbortController identity TanStack chat listens to.
  const abortController = managed.run.currentAbortController;
  if (!abortController) {
    throw new Error(`Agent "${agentId}" missing abort controller after prepareForRun`);
  }

  const inputMessages = messages || [];

  return runStreamWithRecovery({
    managed,
    manager,
    getMessages: () => inputMessages,
    run: (runMessages) =>
      runner.run({
        agentId,
        messages: runMessages,
        abortController,
        threadId: input.threadId,
        runId: input.runId,
      }),
    runner,
  });
}

export function runManagedAgentStream(
  manager: AgentManager,
  agentId: string,
  input: RunAgentStreamInput
): AsyncIterable<StreamChunk> {
  return (async function* () {
    const stream = await executeManagedAgentRun(manager, agentId, input);
    assertAsyncIterable(stream, `executeManagedAgentRun(${agentId})`);
    yield* stream;
  })();
}

export async function runManagedAgent(
  manager: AgentManager,
  agentId: string,
  input: RunAgentStreamInput,
  options: RunAgentOptions = {}
): Promise<AsyncIterable<StreamChunk>> {
  const rawStream = await executeManagedAgentRun(manager, agentId, input);

  if (!options.bridgeUI) {
    return rawStream;
  }

  const managed = manager.getAgent(agentId);
  if (!managed) throw new Error(`Agent not found: ${agentId}`);

  return bridgeAgentStream(managed, rawStream);
}

function ensureUIChannel(managed: ManagedAgent): AgentUIChannel {
  if (!managed.ui) {
    managed.ui = new AgentUIChannel();
  }
  return managed.ui;
}

async function* bridgeAgentStream(
  managed: ManagedAgent,
  stream: AsyncIterable<StreamChunk>
): AsyncIterable<StreamChunk> {
  const channel = ensureUIChannel(managed);

  for await (const chunk of stream) {
    channel.processChunk(chunk);
    yield chunk;
  }

  channel.finalizeStream();
}
