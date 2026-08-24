import { loadAgentDoc } from "../agent/agent-doc-loader.js";
import { AgentLog } from "../agent/agent-log";
import { createCompactionConfig } from "../agent/compaction/types.js";
import { ExtensionLoader, ExtensionRunner, getDefaultExtensionDirs } from "../agent/extension";
import { createLspExtension } from "../agent/lsp";
import { loadMcpConfig, type McpConfigLoadResult } from "../agent/mcp/config.js";
import { McpManager } from "../agent/mcp/manager.js";
import { createMemoryExtension } from "../agent/memory/extension.js";
import { MemoryManager } from "../agent/memory/memory-manager.js";
import { SessionStore } from "../agent/persistence/session-store.js";
import { createCompletePlanTool, createCreatePlanTool, createUpdatePlanTool } from "../agent/plan/create-plan-tool.js";
import { createSkillsExtension } from "../agent/skills/extension.js";
import { SkillRegistry } from "../agent/skills/skill-registry.js";
import { createTaskTool } from "../agent/subagent/task-tool.js";
import { TodoManager } from "../agent/todo-manager";
import { createTodoTool } from "../agent/todo-manager/todo-tool.js";
import { createTools, createWebfetchTool, createWebsearchTool } from "../agent/tools";
import { createAskUserTool } from "../agent/tools/ask-user-tool.js";
import { type ToolsRecord } from "../agent/tools/runtime/tools-record.js";
import { getEnv } from "../env.js";

import { ManagedAgent, type ManagedAgentConfig } from "./managed-agent.js";
import { resolveTextAdapterForManaged } from "./run-agent.js";

import type { AgentManager } from "./agent-manager.js";
import type { AgentEvent } from "./agent-telemetry-bus.js";
import type { SessionBootstrapContext } from "./session-bootstrap-events.js";

export interface BuildManagedAgentResult {
  managed: ManagedAgent;
  bootstrap?: SessionBootstrapContext;
}

export interface BuildManagedAgentOptions {
  config: ManagedAgentConfig;
  parentId?: string;
  manager: AgentManager;
  emit: (event: AgentEvent) => void;
  getDefaultSkillDirs: () => Promise<string[]>;
}

/**
 * Construct and wire a {@link ManagedAgent} (tools, skills, MCP, memory, extensions, session).
 * Registry and parent linking remain the caller's responsibility.
 */
export async function buildManagedAgent({
  config,
  parentId,
  manager,
  emit,
  getDefaultSkillDirs,
}: BuildManagedAgentOptions): Promise<BuildManagedAgentResult> {
  const {
    id: customId,
    modelInfo: explicitModelInfo,
    name,
    skillDirs,
    compaction,
    mcpConfigPath,
    ...restConfig
  } = config;

  const resolvedModelInfo = explicitModelInfo ?? null;
  const fsRootPath = getEnv().rootPath;
  const log = new AgentLog();
  const todoManager = parentId ? null : new TodoManager();

  const managed = new ManagedAgent(
    { ...restConfig, name },
    {
      id: customId,
      log,
      tools: {},
      todoManager,
      parentId,
    }
  );

  const toolsRecord: ToolsRecord = { ...(await createTools({ usage: managed.usage })) };
  managed.tools = toolsRecord;
  managed.resolveTextAdapter = () => resolveTextAdapterForManaged(managed);
  managed.dispatchEvent = emit;

  if (resolvedModelInfo) {
    managed.setModelInfo(resolvedModelInfo);
    if (resolvedModelInfo.pricing) {
      managed.usage.setPricing(resolvedModelInfo.pricing);
    }
    managed.usage.setCapabilities(resolvedModelInfo.capabilities);
  }

  managed.setLog(log);

  if (!parentId) {
    const docResult = await loadAgentDoc({
      rootPath: fsRootPath,
      filenames: config.agentDocFilenames,
      loadOverride: config.agentDocLoadOverride !== false,
    });
    if (docResult.content) {
      const instructions = docResult.overrideContent
        ? `${docResult.content}\n\n## Local Override\n\n${docResult.overrideContent}`
        : docResult.content;
      managed.setAgentDocContent(instructions, docResult.source);
    }
    if (docResult.notice) {
      log.debug("system", docResult.notice);
    }
  }

  if (!parentId && todoManager) {
    managed.setTodoManager(todoManager);
    toolsRecord.todo = createTodoTool({ todoManager });
    toolsRecord.webfetch = createWebfetchTool({ managed });
    toolsRecord.websearch = createWebsearchTool({ managed });
  }

  if (!parentId) {
    toolsRecord.ask_user = createAskUserTool();
    toolsRecord.create_plan = createCreatePlanTool({ getPlanMode: () => managed.planMode });
    toolsRecord.update_plan = createUpdatePlanTool({ getPlanMode: () => managed.planMode });
    toolsRecord.complete_plan = createCompletePlanTool({ getPlanMode: () => managed.planMode });
  }

  let mcpLoadResult: McpConfigLoadResult | null = null;

  // Shared across bootstrap blocks: populated in the skill-loading block, consumed
  // by the built-in Skills extension in the extension-loading block.
  let skillRegistry: SkillRegistry | null = null;

  if (!parentId) {
    skillRegistry = new SkillRegistry({ rootPath: fsRootPath });
    managed.setSkillRegistry(skillRegistry);

    const dirsToLoad = skillDirs ?? (await getDefaultSkillDirs());
    await skillRegistry.loadFromDirectories(dirsToLoad);
    log.info("skill", `Loaded ${skillRegistry.size} skills from ${dirsToLoad.length} directories`);

    toolsRecord.task = createTaskTool({ parentAgentId: managed.id, manager });

    const compactionInput = { ...compaction };
    if (!compactionInput?.tokenThreshold && resolvedModelInfo?.contextWindow) {
      // NOTE: MAX_THRESHOLD caps the compaction trigger threshold, NOT the model's context window.
      // The model itself (e.g. DeepSeek V4 Flash) may support up to 1M tokens, but the UI
      // displays tokenLimit (== compaction tokenThreshold) — so users see e.g. "35%/200k"
      // instead of "7%/1M". This is by design: compaction triggers early to keep the agent
      // responsive and avoid hitting the actual context limit. If you want the UI to show the
      // real model context window, increase or remove this cap.
      const MAX_THRESHOLD = 200_000;
      compactionInput.tokenThreshold = Math.min(resolvedModelInfo.contextWindow, MAX_THRESHOLD);
    }
    managed.setCompactionConfig(createCompactionConfig(compactionInput));

    const mcpManager = new McpManager();
    managed.setMcpManager(mcpManager);
    mcpLoadResult = await loadMcpConfig(mcpConfigPath);
    if (mcpLoadResult && Object.keys(mcpLoadResult.config.mcpServers).length > 0) {
      Object.assign(toolsRecord, await mcpManager.initialize(mcpLoadResult.config));
    }
    if (mcpLoadResult?.loadErrors) {
      for (const err of mcpLoadResult.loadErrors) {
        log.warn("system", err);
      }
    }

    // Memory manager is always created when enabled (drives the per-turn
    // relevance query + extraction in MemoryService). The built-in Memory
    // extension (loaded below) wraps it for presentation: tools, index injection.
    if (config.memory !== false) {
      const memoryManager = new MemoryManager({ rootPath: fsRootPath });
      await memoryManager.initialize();
      managed.setMemoryManager(memoryManager);
      log.debug("memory", `Memory initialized, index: ${memoryManager.getIndexContent().length} bytes`);
    }
  }

  if (!parentId) {
    const extensionRunner = new ExtensionRunner({
      // Extensions access the environment primarily via ctx.coreEnv.getEnv() (async).
      // getEnvVar stays a sync best-effort hook for convenience fields like API keys.
      getEnvVar: () => undefined,
      onRegisterTool: (def) => managed.registerTool(def),
      onRegisterCommand: (cmd) => managed.registerCommand(cmd),
      onUnregisterTool: (name) => managed.unregisterExtensionTool(name),
      onUnregisterCommand: (name) => managed.unregisterExtensionCommand(name),
      cwd: fsRootPath,
      getCoreEnv: () => getEnv(),
    });
    managed.extensionRunner = extensionRunner;

    const extensionLoader = new ExtensionLoader();
    managed.extensionLoader = extensionLoader;

    const extensionDirs = await getDefaultExtensionDirs(config.extensionDirs);
    log.debug("system", "Extension search directories", { dirs: extensionDirs });

    const fromDisk = await extensionLoader.loadFromDirectories(extensionDirs);
    for (const err of fromDisk.errors) {
      log.warn("system", err.message);
    }
    for (const api of fromDisk.loaded) {
      try {
        await extensionRunner.loadExtension(api);
        log.info("system", `Extension loaded from disk: ${api.id}`);
      } catch (err) {
        log.warn("system", `Failed to activate extension from disk "${api.id}": ${err}`);
      }
    }

    if (config.extensions && config.extensions.length > 0) {
      for (const factory of config.extensions) {
        try {
          const api = await factory.create();
          await extensionRunner.loadExtension(api);
          log.info("system", `Extension loaded from config: ${api.id}`);
        } catch (err) {
          log.warn("system", `Failed to load extension from config: ${err}`);
        }
      }
    }

    // Built-in LSP extension (enabled unless explicitly disabled).
    if (config.lsp !== false) {
      try {
        // `config.lsp` may be `true`/undefined (defaults) or a fine-grained
        // LspExtensionConfig object ({ disabledTools, enableAll }).
        const lspOptions = typeof config.lsp === "object" && config.lsp !== null ? config.lsp : undefined;
        const api = createLspExtension(lspOptions);
        await extensionRunner.loadExtension(api);
        log.info("system", `Built-in extension loaded: ${api.id}`);
      } catch (err) {
        log.warn("system", `Failed to load built-in LSP extension: ${err}`);
      }
    }

    // Built-in Skills extension (enabled unless explicitly disabled).
    // `config.skills` may be `true`/undefined (defaults) or a fine-grained
    // SkillsExtensionConfig object ({ toolsDisabled, indexDisabled }).
    if (config.skills !== false && skillRegistry) {
      try {
        const skillsConfig = typeof config.skills === "object" && config.skills !== null ? config.skills : undefined;
        const api = createSkillsExtension({ skillRegistry, config: skillsConfig });
        await extensionRunner.loadExtension(api);
        log.info("system", `Built-in extension loaded: ${api.id}`);
      } catch (err) {
        log.warn("system", `Failed to load built-in Skills extension: ${err}`);
      }
    }

    // Built-in Memory extension (enabled unless explicitly disabled).
    // `config.memory` may be `true`/undefined (defaults) or a fine-grained
    // MemoryExtensionConfig object ({ toolsDisabled, indexDisabled }).
    // The memory manager must be enabled too (MemoryService query depends on it).
    if (config.memory !== false) {
      try {
        const memoryManager = managed.getMemoryManager();
        if (memoryManager) {
          const memoryConfig = typeof config.memory === "object" && config.memory !== null ? config.memory : undefined;
          const api = createMemoryExtension({ memoryManager, config: memoryConfig });
          await extensionRunner.loadExtension(api);
          log.info("system", `Built-in extension loaded: ${api.id}`);
        }
      } catch (err) {
        log.warn("system", `Failed to load built-in Memory extension: ${err}`);
      }
    }
  }

  if (!parentId) {
    const sessionStore = new SessionStore();
    managed.setSessionStore(sessionStore, {
      modelStyle: config.modelStyle ?? resolvedModelInfo?.style ?? "openai",
      model: restConfig.model,
    });
  }

  managed.name = name;

  let bootstrap: SessionBootstrapContext | undefined;
  if (!parentId) {
    bootstrap = {
      cwd: fsRootPath,
      mcpConfigPath,
      mcpConfigLoadedFrom: mcpLoadResult?.sourcePath,
    };
  }

  return { managed, bootstrap };
}
