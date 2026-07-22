import { AgentContext } from "../agent/agent-context";
import { loadAgentDoc } from "../agent/agent-doc-loader.js";
import { AgentLog } from "../agent/agent-log";
import { createCompactionConfig } from "../agent/compaction/types.js";
import { ExtensionLoader, ExtensionRunner } from "../agent/extension";
import { loadMcpConfig, type McpConfigLoadResult } from "../agent/mcp/config.js";
import { McpManager } from "../agent/mcp/manager.js";
import { MemoryManager } from "../agent/memory/memory-manager.js";
import { SessionStore } from "../agent/session/session-store.js";
import { SkillRegistry } from "../agent/skills/skill-registry.js";
import { TodoManager } from "../agent/todo-manager";
import { createTools, createWebfetchTool, createWebsearchTool } from "../agent/tools";
import { createAskUserTool } from "../agent/tools/ask-user-tool.js";
import { createListSkillsTool } from "../agent/tools/list-skills-tool.js";
import { createLoadSkillTool } from "../agent/tools/load-skill-tool.js";
import { type ToolsRecord } from "../agent/tools/tanstack/tools-record.js";
import { createTaskTool } from "../agent/tools/task-tool.js";
import { createTodoTool } from "../agent/tools/todo-tool.js";
import { getEnv } from "../env.js";

import { ManagedAgent, type ManagedAgentConfig } from "./managed-agent.js";
import { resolveTextAdapterForManaged } from "./run-agent.js";

import type { AgentEvent } from "./agent-event-bus.js";
import type { AgentManager } from "./manager-agent.js";
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
 * Construct and wire a {@link ManagedAgent} (tools, skills, MCP, memory, hooks, session).
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

  const context = new AgentContext();

  const managed = new ManagedAgent(
    { ...restConfig, name },
    {
      id: customId,
      context,
      log,
      tools: {},
      todoManager,
      parentId,
    }
  );

  const toolsRecord: ToolsRecord = { ...(await createTools({ context, usage: managed.usage })) };
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

  managed.setContext(context);
  managed.setLog(log);

  if (!parentId) {
    const docResult = await loadAgentDoc({
      rootPath: fsRootPath,
      filenames: config.agentDocFilenames,
      loadOverride: config.agentDocLoadOverride !== false,
      logger: log,
    });
    if (docResult.content) {
      const instructions = docResult.overrideContent
        ? `${docResult.content}\n\n## Local Override\n\n${docResult.overrideContent}`
        : docResult.content;
      managed.setAgentDocContent(instructions, docResult.source);
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
  }

  let mcpLoadResult: McpConfigLoadResult | null = null;

  if (!parentId) {
    const skillRegistry = new SkillRegistry({ rootPath: fsRootPath, logger: log });
    managed.setSkillRegister(skillRegistry);

    const dirsToLoad = skillDirs ?? (await getDefaultSkillDirs());
    await skillRegistry.loadFromDirectories(dirsToLoad);

    toolsRecord.list_skills = createListSkillsTool({ skillRegistry });
    toolsRecord.load_skill = createLoadSkillTool({ skillRegistry });
    toolsRecord.task = createTaskTool({ parentAgentId: managed.id, manager });

    const compactionInput = { ...compaction };
    if (!compactionInput?.tokenThreshold && resolvedModelInfo?.contextWindow) {
      const MAX_THRESHOLD = 200_000;
      compactionInput.tokenThreshold = Math.min(resolvedModelInfo.contextWindow, MAX_THRESHOLD);
    }
    managed.setCompactionConfig(createCompactionConfig(compactionInput));

    const mcpManager = new McpManager();
    managed.setMcpManager(mcpManager);
    mcpLoadResult = await loadMcpConfig(log, mcpConfigPath);
    if (mcpLoadResult && Object.keys(mcpLoadResult.config.mcpServers).length > 0) {
      Object.assign(toolsRecord, await mcpManager.initialize(mcpLoadResult.config));
    }

    const memoryManager = new MemoryManager({ rootPath: fsRootPath }, log);
    await memoryManager.initialize();
    managed.setMemoryManager(memoryManager);
    managed.setMemoryContent(memoryManager.getIndexContent());
  }

  if (!parentId) {
    const extensionRunner = new ExtensionRunner({
      getEnvVar: (_key: string) => undefined,
      onRegisterTool: (def) => managed.registerTool(def),
      onRegisterCommand: (cmd) => managed.registerCommand(cmd),
    });
    managed.extensionRunner = extensionRunner;

    const extensionLoader = new ExtensionLoader();
    managed.extensionLoader = extensionLoader;

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
