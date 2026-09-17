## Context

`ExtensionContext`（`packages/core/src/agent/extension/types.ts:377-413`）今天只提供四条注册通道：`registerTool` / `registerCommand` / `registerInterceptor` / `registerContextProvider`。扩展能看到的东西止于：工具入参出参（`tool:before:*` / `tool:after:*`）、每轮提示词追加（`registerContextProvider`）、以及若干生命周期事件。**模型消息链本身对扩展不可见。**

这带来的不是单一场景的缺失，而是整类能力的缺失：媒体转文本、脱敏、裁剪、wire 专用上下文注入、体积控制——全部无法实现。core 自己反而有一条"吞掉媒体"的通路（`capability-message-utils.ts:27` 的占位符 + `run-stream-recovery.ts:183` 的剥离），扩展连在吞掉之前插一手的机会都没有。

Pi 的对照很直接：它有 `context` 事件（每次 LLM 调用前拿到 messages 的深拷贝副本，可非破坏性改写），所以"用外部多模态端口补足非多模态模型"这类扩展在 Pi 上是可写的。我们的架构里对应的缝落在哪里，是本设计要回答的核心问题。

**已验证的连带事实（全部读代码确认，非推断）：**

1. **`config.messages` 注入会被覆盖——仓库里正在发生。** `max-tokens-continue.ts:66-69` 把 `CONTINUATION_PROMPT` 拼在 `getMessagesForLLM()` 之后交给 `runner.run()`；下一次 `chat()` 的 init `onConfig` 由 `compaction-middleware.ts:74` 从 channel 重新投影（`projectWireFromChannel` 不看 `config.messages`），再经 `compose.ts:169` 浅合并覆盖，最后 `applyMiddlewareConfig`（TanStack `index.ts:4370`）整体赋值。**continuation prompt 到达不了 adapter。** 且 `compaction-middleware.ts:66-68` 的 `!channel` 回退分支因 `run-agent.ts:288-290` 强制要求 channel 而**永不触发**，所以是必然发生而非边缘情况。这是**既有缺陷，独立于本变更**，但它正是 D1 要规避的失效模式。
2. **中间件配置是顶层浅合并**（`compose.ts:157-169`），且 `this.messages = config.messages` 为直接赋值（`index.ts:4368-4370`）。推论：返回新数组 = 整体替换，可靠；**就地改写同样生效**，但污染会留在共享缓存数组里跨调用泄漏且无任何症状——必须靠 API 形状排除，不能靠文档提醒。
3. **能力在运行中不会重建**：`setModelInfo`（`managed-agent.ts:793-800`）只赋值；`usage.setCapabilities` 仅两处（`agent-factory.ts:86-92` bootstrap、`managed-agent.ts:834-840` 模型切换，后者同时 `invalidateRunner()`）。每次 `onConfig` 现算能力是安全的，跨模型切换自动更新。
4. **扩展在托管 AgentManager 的进程里加载**：`agent-factory.ts:176` 的 `if (!parentId)`；`remote-session-host.ts:54-71` 通过 HTTP 创建远端 agent 并携带 `extensionDirs`，即 ManagedAgent 建在 **server** 侧，故 transformer 也在 server 侧执行。
5. **`input` 事件对本场景无增量**：用户附件经 `use-agent-chat.ts:94-110` 变成 user message 的 `ContentPart[]`，由 `agent-chat-controller.ts:208` 写入 channel——transformer 已经能看到它。

**其他现状约束（来自代码勘察）：**

1. **`onConfig` 的 message 变换存在，且已有先例**：`tool-compact-middleware`（`managers/middleware/tool-compact-middleware.ts:24-27`）与 `compaction-middleware`（`:57-62`）都在 `context-transform` 相位改写 `config.messages`。所以"改写 wire"这件事在 core 内部不新鲜，缺的只是**对扩展开放**。
2. **`compaction-middleware` 是 channel 锚定的，不是 engine 锚定的**：`projectWireFromChannel`（`compaction-middleware.ts:40-52`）无视 `config.messages`，直接从 `channel.getMessages()` 投影。这是有意的（`unified-message-chain` spec 的 "Middleware summary-first wire projection"），也是 remote/HTTP 宿主能工作的原因。**结论：任何试图只改 `config.messages` 的扩展 hook 都会在下一轮被覆盖。**
3. **投影结果被缓存共享**：`WireProjectionCache`（`agent/compaction/wire-projection-cache.ts:49-70`）按 fingerprint 复用同一个数组引用，交给 TanStack 的 `applyMiddlewareConfig`。扩展若就地改写这个数组，污染会留在缓存里跨调用泄漏。
4. **发送前的剥离发生在 run 入口，不在每次迭代**：`messagesForModelCapabilities` 只在 `runStreamWithRecovery`（`run-stream-recovery.ts:101,123,183`）里被调用。迭代 ≥ 1 时消息来自 `onConfig` 的 channel 投影 + engine 累积，不经过这次剥离。
5. **`before_agent_start` 是"每轮提示词"、不是"每次 wire"**：`ExtensionRunner.collectBeforeAgentStart`（`runner.ts:455-496`）每轮跑一次，产出的是 `<ctx kind=...>` 文本段，且 `collectBeforeAgentStart` 是**同步签名**（`turn-context-middleware.ts:60-145` 的 `onConfig` 也是同步的）。要接一个会做网络调用的 transformer，必须走异步缝。
6. **`agent-event-bus` 的拦截模式是"共享可变 event + cancel 短路"**，`interceptorMatches` 支持 `prefix:*`（`agent-event-bus.ts:41-45`）。用它做 message 变换需要新 dispatch 形状，与 "No additional dispatch modes" 要求（`openspec/specs/agent-event-bus/spec.md:49-51`）正面冲突。
7. **子 agent 有独立 runner**：`agent-factory.ts:176` 的 `if (!parentId)` 守卫使扩展只在根 agent 上加载，子 agent 天然不继承。

## Goals / Non-Goals

**Goals:**

- 给扩展一条**权威**的 message 变换缝，落在每条 wire 构建路径上都会执行的位置。
- 语义与既有 wire-only 惯例一致：变换只影响本次 run 发给模型的内容，**绝不写回 UI channel / 会话存储**。
- 零空转成本：没有扩展注册 transformer 时，热路径逐字节不变（含缓存行为）。
- 不引入第三个 dispatch mode，不改既有 hook 名。
- 让扩展**不必自己重新推导**模型能力：core 把"当前模型不接受哪些媒体 part 类型"直接交给它。

**Non-Goals:**

- 不做媒体转文本的内置实现（那是扩展的事，本变更只给缝）。
- 不开放 `input` 事件（用户输入拦截）——独立议题，见 Open Questions。
- 不开放 middleware 注册（`ctx.registerMiddleware`）——会破坏 canonical order 契约。
- 不改 `tool:after:*` → `modifiedResult` 的既有语义。
- 不改 `AgentSession` channel 协议与 SSE 信封。
- 不动 `agent-event-bus` 的 dispatch 机制。

## Decisions

### D1: 缝是独立 middleware，紧跟在 channel 投影之后

**Decision.** transformer 的调用点是**新增的 `message-transform` 中间件**（`managers/middleware/message-transform-middleware.ts`），它只消费 `config.messages`、返回新数组，在 `CANONICAL_MIDDLEWARE_ORDER` 中**紧跟在 `compaction` 之后**（同为 `context-transform` 相位）。

**Why 独立 middleware 而不是改 `compaction` 内部。** 这是实施期修正过的决定。早期方案把调用点塞进 `compaction-middleware` 的 `projectWireFromChannel` 输出处，但那样做把无关内部（投影缓存、keep-policy、post-compact 重投影）暴露给了扩展缝，且 transformer 的注册状态会变成 `compaction` 的依赖。独立 middleware 让 `compaction` 一行不改（缓存契约、keep-policy、投影时机全部保持原样），失败面收敛到一个 100 行文件。

**Why 位置是全部要害.** 由 Context 第 2 条，`config.messages` 在 compaction-middleware 之后就被 channel 投影取代。任何挂在更早位置（例如 `turn-context-middleware`）的转换都会被覆盖。紧跟在投影之后是唯一"每轮都生效、且扩展现能看到权威 wire"的位置——包括首轮（init `onConfig`）与每一次迭代（`beforeModel` `onConfig`）。因为 `compaction` 与 `message-transform` 同相位，**相位排序无法决定二者相对次序**，实际顺序由 `buildAgentRunner` 的数组位置决定；所以 `validate:middleware-order` 必须驱动**真实装配**（`buildAgentRunner`）来断言这一相邻关系，而不是照抄一份工厂名单——后者只能自证，看到装配被挪位也不会红。

**Alternative considered:** 在 `run-stream-recovery` 的 `messagesForModelCapabilities` 前插一层 wrapper（`managers/stream-recovery/capability-sanitize.ts:39-50`）。**否决**：该函数只在 run 入口调用一次（Context 第 4 条），迭代 ≥ 1 的 wire 不经过它，扩展会"首轮生效、之后静默失效"——这是最坏的一类 API。

**Alternative considered:** 给 `ExtensionContext` 加 `registerInterceptor("context", ...)`，走 `agent-event-bus` 的 intercept 模式。**否决**：intercept 是共享可变 event + cancel 短路（Context 第 6 条），语义是"就地改一个对象"，而 message 变换需要"返回新数组"；而且它要么硬塞进现有 dispatch 形状（与 "No additional dispatch modes" 冲突），要么新增第三种形状（同一 spec 明文禁止）。

### D2: 返回新数组即整体替换；传给 transformer 的数组与消息对象由 core 独占

**Decision.** 每个 transformer 的签名是 `(ctx) => ModelMessage[] | void | Promise<...>`；返回 `void` 表示不变，返回数组则替换（顶层浅合并 + `this.messages = config.messages` 直接赋值，见 Context 第 2 条）。调用前 core 做一次 `ctx.messages.map((m) => ({ ...m }))`，交给 transformer 的外层数组与每个 message 对象都是新对象。

**Why 必须双层拷贝，而不是只拷外层数组或干脆不拷.** 由 Context 第 3 条，投影缓存（`wire-projection-cache.ts:49-70`）保留并复用同一个数组引用；TanStack 把它直接赋给 `this.messages` 后在后续迭代里继续持用。于是扩展若就地改写，会造成两个可观测的坏结果：

1. 改写写穿进缓存保留的数组 → 下一轮**同一次调用不再发生变换**（缓存命中交回已被改写的数组），而扩展作者只会看到"第一轮生效"；
2. 投影缓存生命周期是**一个 run**（`buildAgentRunner` 每次 run 重建），但引擎在 run 内持续持用该数组，就地改写会留在引擎状态里。

只拷外层数组不够：`m.content = ...` 照样写穿到共享的 message 对象上——这正是实施期用 mutation test 抓到的：`slice()` 版本被"缓存数组未被改动"断言咬红。所以拷到 message 对象层。

**边界必须写进文档.** `content` 数组内的 part 对象**仍然共享**——把每个 part 都克隆意味着每次模型调用都要遍历全部消息的全部 part，代价与收益不成比例。要改 part 的 transformer 应**返回新的 message 对象**，而不是就地改 part。API 形状与文档都按这个用法设计。

**零空转保证.** 未注册 transformer → middleware 立刻返回 `{}`（不改 config），投影缓存路径与今天逐字节一致；这也是本变更的硬性验收点。

**Alternative considered:** 在 fingerprint 里加一段"transformer 版本号"来分区缓存，或"注册 transformer 时绕过缓存"。**两者都否决**：前者仍然共享数组引用，别名风险原样保留，且 transformer 可读外部状态、纯函数假设不成立，缓存语义本身就是错的；后者把"缓存是否可用"变成依赖扩展注册状态的运行时分支，等于让扩展影响 compaction 的既有契约——独立 middleware 后完全没有这个必要。

**五种重试全部自动覆盖（已确认）.** transient（`:113-127`）、capability strip（`:107-110`）、reactive compact（`:98-105`）、max_tokens escalation（`:46-53`）、max_tokens continuation（`:55-70`）**全部回到 `run-stream-recovery.ts:197` 的 `options.run(messages)`**，而每次 `runner.run()` 都新建 `chat()` 引擎并跑 init `onConfig`（TanStack `index.ts:1136`）。所以缝只要落在管线里（而不是 `run-stream-recovery` 内部），等于白拿全部五条重试路径的覆盖。这也彻底否掉了挂在 `run-stream-recovery` 入口的方案——不只首轮会被覆盖，还会漏掉全部重试。

### D3: transformer 的语义边界 = compaction 相位的投影输出

**Decision.** spec 明确 transformer 看到的是 **`compaction` 相位投影后的 wire**，其内容边界为：

- **包含** `turn-context` 与 `background-notification` 的合成消息——它们通过 `injectSyntheticMessages` **同时写入 channel 和 wire**（`synthetic-injection.ts:70,74`），投影会重新产出，跨迭代存活且幂等（stable content-hash id）。
- **不包含**任何仅改写 `config.messages` 的中间件改动。`CANONICAL_MIDDLEWARE_ORDER`（`phase.ts:27-41`）中 `compaction` 是 index 3、`message-transform` 是 index 4，其后的 `tool-compact`（index 5，也是 `context-transform`）改写 `config.messages`，而 transformer 的输出在该位置已经定型，所以它也**不在** `ctx.messages` 里。

**Why 必须写进 spec.** 不写清楚，扩展作者会以为 transformer 能观察到全部中间件效果，或以为自己的输出会被后续中间件继续加工。两者都不成立。特别是：**transformer 的输出对 `tool-compact` / `turn-context` 等后续 `config.messages` 改写不可见，反之亦然**——它们共享同一个 config 字段但语义上是"index 4 定格"的。

### D4: 公开 API 形状 —— `ctx.registerMessageTransformer(fn)`

**Decision.**

```ts
export interface MessageTransformContext {
  /** 注册该 transformer 的扩展 id。 */
  extensionId: string;
  /** 本次 run 的 agent id（与 ToolRunContext.agentId 同源，per-run 权威值）。 */
  agentId: string;
  /** 本 run 内的 wire 调用点。 */
  phase: "init" | "iteration";
  /** channel 投影后的 model messages，core 独占：外层数组与 message 对象均为新对象，可安心就地改写。part 对象仍共享，要改 part 请返回新 message。 */
  messages: ModelMessage[];
  /** 当前模型不接受的媒体 part 类型（与发送前剥离同源）。未知能力 → 空集（宽松）。 */
  unsupportedPartTypes: ReadonlySet<"image" | "audio" | "video" | "document">;
  /** 提供方声明的全部能力原值。**空集 = 未知**，不是「无能力」。 */
  capabilities: ReadonlySet<ModelCapability>;
  /** 下面每个布尔都宽松：能力未知时为 `true`。 */
  modelHasVision: boolean;
  modelHasAudio: boolean;
  modelHasVideo: boolean;
  modelHasDocument: boolean;
  modelHasReasoning: boolean;
  modelHasToolCalling: boolean;
  modelHasPromptCaching: boolean;
  modelHasStreaming: boolean;
  modelHasJsonOutput: boolean;
  modelHasComputerUse: boolean;
  abortSignal?: AbortSignal;
}

export type MessageTransformer = (ctx: MessageTransformContext) => Promise<ModelMessage[] | void> | ModelMessage[] | void;
```

`ExtensionContext` 新增 `registerMessageTransformer(fn: MessageTransformer): () => void`。**一个扩展至多一个激活的 transformer**（重复注册替换，返回的 disposer 只在仍是当前注册者时生效——与 `registerContextProvider` 的既有写法对齐，`runner.ts:716-723`）。

**Why 暴露全部能力位.** `ModelCapability` 共 10 个成员。只给 `modelHasVision` 会让"音频/文档模型"类扩展无路可走——它们要判的能力和 vision 同等重要，而扩展自行读环境变量判能力就是把 `MODEL_MULTIMODAL` 这类宿主配置复制进扩展，必然发散。一次性给全，与 `ExtensionUiUsage` 等既有 `Extension*` 面透传宿主信息的做法一致。原始 `capabilities` 集合同时给，因为布尔无法表达"**未声明**"与"声明了但没有"的区别（二者都为 `true`）。

**能力列表只有一份，靠类型强制同步.** `models/types.ts` 导出运行期常量 `MODEL_CAPABILITIES`，`ModelCapability` 由它派生（`(typeof MODEL_CAPABILITIES)[number]`），所以联合与数组**结构上不可能漂移**。`MessageTransformContext` 的扁平标志位（`modelHasVision` 等）来自 `MODEL_CAPABILITY_FLAGS`，其类型是 `satisfies Record<ModelCapability, string>`——**给 `MODEL_CAPABILITIES` 加一个成员而不在此处命名，就是编译错误**，不是运行期静默漏一个 flag。标志位名映射到类型用映射类型派生，所以 `MessageTransformContext` 的字段集合同样无手写清单。验证脚本也 `Object.entries(MODEL_CAPABILITY_FLAGS)` 取表，因此新能力自动被覆盖。

**Why 带 `unsupportedPartTypes` / `capabilities` / `modelHas*`.** 由 Context 第 2 条与 `usage-tracker.ts:200-203`，能力判定集中在 `UsageTracker.hasCapability`，而 `ExtensionContext` 目前完全够不到它（没有 usage、没有 model info——`ExtensionToolDefinition.execute` 的 ctx 也只有 `toolCallId`/`abortSignal`/`agentId`）。让扩展自己去读环境变量判能力，等于把 `MODEL_MULTIMODAL` 这类宿主配置复制进扩展，必然发散。core 已在 `unsupportedMultimodalPartTypes` 里算过一遍，直接透传是最小且不会漂移的做法。能力面一次性给全（见上面「Why 暴露全部能力位」），而不是等第二、三个消费场景出现再逐个补。

**Why 不是 `registerInterceptor("before_provider_request", ...)`.** 对齐 Pi 的命名会诱导"这是又一个 event bus hook"的误解。它刻意不走 bus（见 D1 的 alternative），用具名注册方法比伪装成事件更不容易被误用。

### D5: 顺序、隔离与脱敏边界

**Decision.**

- 多个扩展的 transformer 按**扩展加载顺序**串行，前一个的输出是后一个的输入（与 `agent-event-bus.ts:134-146` 的拦截顺序一致）。
- transformer 抛错 → 记 `warn` 日志 + `emit("agent:extension-error", { phase: "message-transform" })`，**保留该次变换之前的结果**并继续后续 transformer。绝不因扩展异常中断一次 run。
- 返回值做**浅校验**：必须是数组且每项有 `role`；否则视为无效、保留上一次结果并告警。
- 文档明确：transform 是"就地替换内容"，**不承诺改变消息条数**。压缩/裁剪属于 `context-transform` 相位的职责，扩展若删消息会与 keep-policy / summary 投影的假设冲突。

**Why 串行而非并行.** 并行需要一个 reduce/merge 语义，而 message 变换的"合并"没有自然定义；串行还让"扩展 A 的输出是扩展 B 的输入"这一直觉成立。

### D6: 生命周期与作用域

**Decision.** transformer 随扩展 `activate` 注册，随 disable/destroy 注销（挂进 `ExtensionRegistrations`，与 `unsubTurnContext` 并列，`extension/types.ts:437-447`）。`setEnabled(false)` 后 transformer 不再执行。**子 agent 不继承**（独立 runner，Context 第 7 条）——与 MCP / 扩展的既有隔离一致，本变更不引入继承语义。

### D7: 文档契约同步

**Decision.** 更新 `packages/core/ARCHITECTURE.md` §8.5 扩展拦截章节（`:799-811`）与两处 pattern 列表（`:756`、`:801`）、`AGENTS.md` 扩展章节与 Agent Event System 表格（`:450-456`、`:511-533`）。新增的 `message-transform` 中间件也要进中间件清单（含其位置契约与"同相位、靠数组位置定序"的事实）。

**Why 必须做.** `agent-lifecycle-events` 的 "Architecture docs describe extension observation model" 要求文档描述扩展面；`ARCHITECTURE.md:801` 现在断言扩展只有那四种 hook。不更新就是文档与实现直接矛盾。

## Risks / Trade-offs

- **[扩展就地改写污染 wire / 第一轮之后静默失效] →** 由 D2 消除：交给 transformer 的外层数组与 message 对象由 core 创建，投影缓存保留的数组不再与扩展可见的数组别名。part 数组仍共享，故此边界必须落在文档与 spec 上。
- **[扩展在 transformer 里做网络调用拖慢每次迭代] →** 属扩展自身责任，但给两层保护：`abortSignal` 透传（本 run 取消即中止）、`warn` 级慢调用日志。文档明确"每个 wire 调用都会跑一次，别做无限期等待"。
- **[删消息导致 wire 与 keep-policy 假设冲突] →** D4 明文写进 spec 与文档：不承诺改条数。真正的裁剪留给 core 的 `context-transform` 相位。
- **[`config.messages` 与 channel 投影不一致的历史坑会掩盖 transformer 是否生效] →** 本变更顺势把这条链写进 spec（D1 的 Why），并在 tasks 里安排一个"断言 transformer 在迭代 ≥ 2 仍生效"的验证脚本——这正是 alternative 方案会静默失败的地方。**同一个坑已经在 `max-tokens-continue` 上咬过一次**（Context 第 1 条），守卫必须按此模式设计。
- **[新增一个中间件的固定开销] →** 已实测：未注册 transformer 时 `onConfig` 立即返回 `{}`，不读 channel、不算投影、不拷贝数组，逐字节等同没有这个中间件。代价是一个额外的 `onConfig` 调用与一次 `hasMessageTransformers()`（`Set.size > 0`）。
- **[远端宿主下的执行位置与凭据] →** 由 Context 已确认事实第 4 条：transformer 在 **server 侧**执行，看到的是 server 的 `ctx.coreEnv`（fs/shell/fetch）。这对特性是正确位置（provider 调用也在 server 侧，少一跳），但必须写进文档：外部多模态端点的 API key 要放在 server 环境而非客户端；扩展读到的路径是 server 的路径。
- **[Playground / WebContainer 无磁盘扩展] →** 发现路径依赖动态 `import(file://...)`（`loader.ts:170-172` + `paths.ts:67-73`），浏览器环境不支持。这是**既有约束**，本变更不修改；文档不得对 playground 上的 transformer 作出承诺。
- **[`max-tokens-continue` 的 continuation prompt 被覆盖] →** 代码级已完全确认，尚未运行时复现。链路每一步都已读到实际代码（见 Context 已确认事实第 1 条），且 `!channel` 回退分支永不触发，所以是必然发生而非边缘情况。属**既有缺陷，独立开单**，不在本变更范围。预期症状可作为复现判据：escalation 分支（`:46-53`）不受影响，所以表现为"第一次升 max_tokens 有效，之后连续截断会重复同样输出直到耗尽 3 次"。

## Migration Plan

1. 类型与注册表先行（`extension/types.ts` + `runner.ts`），此时无调用点，行为零变化。
2. 新增独立 middleware 并接进 `buildAgentRunner`（紧跟 `compaction`）。行为在有 transformer 时才变；`compaction-middleware.ts` **不被修改**。
3. 文档与验证脚本同批落地；`validate:middleware-order` 与 `validate:extensions-middleware` 必须仍然通过。**注意**：本变更是四档 phase 管线引入以来**首次新增中间件**（12 → 13 个），所以 `CANONICAL_MIDDLEWARE_ORDER` 与 `validate-middleware-order` 的快照都被有意更新，而不是"未改动"。
4. 回滚策略：移除 `message-transform` 中间件与注册 API 即回到今天的行为；无持久化格式变化，无会话迁移。

## Open Questions

- **`input` 事件（用户输入拦截）是否单独开放？** 已查证：本场景**不需要**它（Context 已确认事实第 5 条——附件就是 channel 里的一条消息，transformer 看得见）。它真正的增量是"在消息进入 channel **之前**拦截"与 `handled` 吞掉整个 turn，但输入路径有三条（`sendMessage` / `forceSubmit` / `followUp` 队列），插入异步扩展调用意味着**发送动作要 await 扩展代码**——扩展挂住则用户发不出消息。新增失败模式服务的是一个尚不存在的需求。**建议独立变更 + 独立风险分析**，不在本变更范围。
- **expose 能力面是否过宽？** 已从"只有 `unsupportedPartTypes` + `modelHasVision`"扩展到 `ModelCapability` 全量标志位 + 原始集合。理由：`ModelCapability` 是封闭联合，扩展要判音频/文档能力时 `modelHasVision` 帮不上忙，缺哪个补哪个会让同一类型被反复改；布尔无法表达"未声明"，所以原始集合必须同给。代价是 `MessageTransformContext` 变宽——可接受，它只是数据袋，无行为耦合。
- **标志位是否该手写？** 否。手写会让"新增能力"变成"记得改第四个地方"，而漏改的症状是运行期少一个 flag、无任何报错。已改为单一常量 + `satisfies Record<ModelCapability, string>` 穷尽性约束 + 映射类型派生字段：漏改 = 编译失败。
- **`max-tokens-continue` 缺陷的修复是否应复用本变更的缝？** 不建议。修复方向（把 continuation 写入 channel，或改到另一个能存活的 wire 位置）与本变更的 transformer 缝无关；不要在同一个变更里做两件事。
