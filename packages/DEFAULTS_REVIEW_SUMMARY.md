# Default Settings Review Summary

**Date:** 2026-04-27  
**Scope:** `@packages/cli/src` and `@packages/core/src`  
**Goal:** Review all default settings, identify inconsistencies, and provide recommendations

---

## Executive Summary

The review identified **one primary inconsistency** between CLI and core defaults: `maxIterations` (CLI: 20, Core: 10). This is by design (CLI overrides core), but the difference could cause confusion. All other defaults are either CLI-specific, core-only, or consistent across packages.

**Overall Assessment:** Defaults are well-designed and appropriate for the project's use case. The architecture properly supports CLI overrides of core defaults.

---

## Complete Defaults Catalogue

### Configuration & Connection Defaults

| Setting | Core Default | CLI Default | Location | Consistent? |
|---------|-------------|-------------|----------|-------------|
| **maxIterations** | `10` | `20` | Core: `Agent.ts:188`, CLI: `use-args.ts:150` | ⚠️ Different (intentional) |
| **Ollama URL** | `http://localhost:11434` | Inherited from core | Core: `types.ts:26` | ✅ Consistent |
| **Sandbox Mode** | `"local"` | `"local"` | Core: `environment/local.ts`, CLI: `index.tsx` | ✅ Consistent |
| **MCP Config Path** | `.opencode/mcp.json` | `""` (falls back to core) | Core: `mcp/config.ts:11`, CLI: `use-args.ts:197` | ✅ Consistent (fallback) |

### Model & Provider Defaults (CLI-only)

| Setting | Default Value | Location | Notes |
|---------|--------------|----------|-------|
| **model** | `qwen2.5-coder:7b` | `use-args.ts:73` | CLI-specific, reasonable default for coding tasks |
| **provider** | `ollama` | `use-args.ts:74` | CLI-specific, matches Ollama URL default |

### Compaction Defaults (Core-only)

| Setting | Default Value | Location | Notes |
|---------|--------------|----------|-------|
| **tokenThreshold** | `100000` | `compaction/types.ts:94` | Triggers compaction at 100K tokens |
| **keepRecentToolResults** | `3` | `compaction/types.ts:95` | Keeps last 3 tool results in context |
| **transcriptDir** | `.transcripts` | `compaction/types.ts:96` | Directory for conversation transcripts |
| **minToolResultSize** | `100` | `compaction/types.ts:97` | Minimum size for tool result compaction |

### Tool Limits (Core-only)

| Setting | Default Value | Location | Notes |
|---------|--------------|----------|-------|
| **MAX_CONTENT_LENGTH** | `100000` | `read-file-tool.ts:15` | Max file content length for read-file tool |
| **MAX_BINARY_SIZE** | `10MB` | `read-file-tool.ts:16` | Max binary file size |
| **DEFAULT_LINE_LIMIT** | `2000` | `read-file-tool.ts:17` | Default lines to read from files |
| **MAX_OUTPUT_LENGTH** | `50000` | `run-command-tool.ts:9` | Max command output length |
| **DEFAULT_TIMEOUT** | `30` (seconds) | `websearch-tool.ts:21` | Web search timeout |
| **MAX_RESULTS** | `10` | `websearch-tool.ts:23` | Max web search results |
| **DEFAULT_RESULTS** | `5` | `websearch-tool.ts:24` | Default web search results |

### Provider Defaults (Core-only)

| Setting | Default Value | Location | Notes |
|---------|--------------|----------|-------|
| **reasoning** | `true` | `provider.ts:62` | Enable reasoning for Ollama provider |
| **reasoningTagName** | `"think"` | `provider.ts:62` | XML tag for reasoning content |

### System Prompt (CLI-only)

| Setting | Default Value | Location | Notes |
|---------|--------------|----------|-------|
| **DEFAULT_SYSTEM_PROMPT** | Multi-line prompt | `use-args.ts:75-148` | Comprehensive system prompt for coding assistance |

---

## Detailed Analysis

### maxIterations Flow (Verified)

The `maxIterations` setting flows through the following path:

```
CLI Layer:
  use-args.ts:150 (DEFAULT_MAX_ITERATIONS = 20)
       ↓
  use-args.ts:193 (passes to Agent.tsx)
       ↓
  Agent.tsx:59 (passes to useLocalChat hook)
       ↓
  use-local-chat.ts:138 (uses value or falls back to 10)
       ↓
  create.ts:64 (passes to agentManager.create)
       ↓
Core Layer:
  Agent.ts:188 (AgentConfigSchema, default ?? 10)
```

**Finding:** CLI default (20) properly overrides core default (10). This is intentional design, but having different values could confuse users who check both locations.

### Consistency Analysis

**Consistent Defaults:**
- ✅ Ollama URL: Both use `http://localhost:11434`
- ✅ Sandbox Mode: Both default to `"local"`
- ✅ MCP Config: CLI empty string falls back to core's `.opencode/mcp.json`

**CLI-Specific Defaults (No Conflict):**
- ✅ `model`, `provider`: Only relevant at CLI level
- ✅ `DEFAULT_SYSTEM_PROMPT`: CLI-specific customization

**Core-Specific Defaults (No Conflict):**
- ✅ Compaction settings: Internal to agent loop
- ✅ Tool limits: Internal to tool implementations
- ✅ Provider options: Internal to provider configuration

---

## Recommendations

### High Priority

#### 1. Align maxIterations Defaults

**Issue:** CLI uses `20`, Core uses `10`. While CLI properly overrides core, the difference could cause confusion during debugging or when users inspect both code locations.

**Options:**

| Option | Action | Pros | Cons |
|--------|--------|------|------|
| **A** | Change Core default to `20` | Consistent values, clearer intent | May affect other CLI implementations |
| **B** | Change CLI default to `10` | Consistent values, more conservative | May reduce effectiveness for complex tasks |
| **C** | Keep as-is, add documentation | No code changes, explains intent | Values still differ |
| **D** | Remove core default, require explicit value | Forces intentionality | Breaking change |

**Recommended:** **Option A** - Change Core default to `20`.

**Rationale:**
- 20 iterations is more appropriate for complex coding tasks (the primary use case)
- CLI is the main consumer of the core package
- Aligns with the existing CLI choice (suggests it was tested/validated)
- Minimal risk: users relying on the default of 10 are likely getting insufficient iterations

**Implementation:**
```typescript
// packages/core/src/agent/loop/Agent.ts (line 188)
// Change from:
maxIterations: z.number().optional().default(10)
// To:
maxIterations: z.number().optional().default(20)
```

### Medium Priority

#### 2. Document Default Override Pattern

**Issue:** The pattern of CLI defaults overriding core defaults is not explicitly documented.

**Recommendation:** Add documentation in both packages explaining:
- Which defaults are intended to be overridden by CLI
- The precedence order (CLI > Core > Hardcoded)
- How to verify which default is in effect

**Location:** Add to `packages/core/README.md` and `packages/cli/README.md`

#### 3. Consider Centralizing Common Defaults

**Issue:** Some defaults exist in multiple locations (e.g., sandbox mode).

**Recommendation:** Create a shared constants file for defaults that should be identical across packages:

```typescript
// packages/core/src/constants/defaults.ts
export const DEFAULTS = {
  OLLAMA_URL: 'http://localhost:11434',
  SANDBOX_MODE: 'local' as const,
  MAX_ITERATIONS: 20,
  MCP_CONFIG_PATH: '.opencode/mcp.json',
} as const;
```

Then import in CLI:
```typescript
// packages/cli/src/index.tsx
import { DEFAULTS } from '@opencode/core/constants';
```

### Low Priority

#### 4. Review Tool Limits for Appropriateness

**Current tool limits appear reasonable, but consider:**

| Setting | Current | Consider |
|---------|---------|----------|
| MAX_CONTENT_LENGTH (100K) | Appropriate for most files | Could document when this limit is hit |
| MAX_OUTPUT_LENGTH (50K) | Appropriate | Consider making configurable |
| DEFAULT_TIMEOUT (30s) | Appropriate | Could add retry logic for websearch |

#### 5. Add Default Value Tests

**Recommendation:** Add tests to verify default values don't change unexpectedly:

```typescript
// packages/core/src/agent/loop/Agent.test.ts
describe('defaults', () => {
  it('should have maxIterations default of 20', () => {
    const config = AgentConfigSchema.parse({});
    expect(config.maxIterations).toBe(20);
  });
});
```

---

## Other Observations

### Positive Findings

1. **Good Separation of Concerns:** CLI-specific defaults (model, provider, system prompt) are properly separated from core defaults.

2. **Sensible Fallback Pattern:** MCP config path uses empty string in CLI, falling back to core default - clean design.

3. **Appropriate Tool Limits:** All tool limits (file read, command output, web search) are reasonable and well-documented.

4. **Reasoning Enabled by Default:** Ollama provider has reasoning enabled with clear tag name (`"think"`), good for transparency.

### Potential Improvements

1. **Compaction Settings:** Consider making `tokenThreshold` and `keepRecentToolResults` configurable via CLI flags for power users.

2. **System Prompt:** The default system prompt is comprehensive but long (lines 75-148 in use-args.ts). Consider extracting to a separate file for easier customization.

3. **Model Default:** `qwen2.5-coder:7b` is a good default, but consider adding a comment explaining why this model was chosen.

---

## Action Items Summary

| Priority | Action | Files to Modify |
|----------|--------|-----------------|
| 🔴 High | Change Core maxIterations default from 10 to 20 | `packages/core/src/agent/loop/Agent.ts` |
| 🟡 Medium | Document default override pattern | `packages/core/README.md`, `packages/cli/README.md` |
| 🟡 Medium | Create shared constants file for common defaults | `packages/core/src/constants/defaults.ts` |
| 🟢 Low | Add default value tests | `packages/core/src/**.test.ts` |
| 🟢 Low | Extract system prompt to separate file | `packages/cli/src/system-prompt.ts` |
| 🟢 Low | Add comments explaining model choice | `packages/cli/src/hooks/use-args.ts` |

---

## Conclusion

The default settings across CLI and core packages are well-designed and appropriate for the project's use case. The primary inconsistency (`maxIterations: 20 vs 10`) is functional but should be aligned for clarity. Implementing the high-priority recommendation will eliminate the only meaningful inconsistency, while medium and low-priority items will improve maintainability and documentation.

**Overall Risk Level:** Low - defaults are sensible and the architecture properly supports overrides.

**Recommended Next Step:** Implement the maxIterations alignment (Option A) as it provides the clearest consistency with minimal risk.
