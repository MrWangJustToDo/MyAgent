## 1. Types and prompt builder

- [x] 1.1 Add `BeforeAgentStartEvent` / payload types and `registerTurnContextProvider` on `ExtensionContext`
- [x] 1.2 Extend `DynamicTurnContextInput` + `buildDynamicTurnContext` / `buildSystemPromptWithTurnContext` for extension segments

## 2. Runner and run lifecycle

- [x] 2.1 Implement provider registry + `collectBeforeAgentStart` on `ExtensionRunner`
- [x] 2.2 Wire emit/collect in `prepareManagedAgentForRun` and feed `ManagedAgent` snapshot
- [x] 2.3 Merge provider + event appends into turn-context snapshot rendering

## 3. Demo, docs, validation

- [x] 3.1 Add `examples/extensions/demo-turn-context.mjs` and README row
- [x] 3.2 Update `packages/core/ARCHITECTURE.md` (and AGENTS.md if needed)
- [x] 3.3 Add `packages/core/scripts/validate-extension-prompt-hooks.mjs` + package script
- [x] 3.4 Run `pnpm build:core`, lint, format
