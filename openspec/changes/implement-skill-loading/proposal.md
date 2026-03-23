## Why

Agents need domain-specific knowledge (git workflows, testing patterns, code review checklists) but putting everything in the system prompt wastes tokens on unused skills. The solution is two-layer skill injection: skill metadata in system prompt (cheap), full skill content loaded on-demand via tool (expensive only when needed).

## What Changes

- Add `SkillLoader` class to parse `SKILL.md` files with YAML frontmatter from configurable directories
- Add `SkillRegistry` to manage loaded skills and provide discovery/retrieval
- Add `list_skills` tool for agents to discover available skills
- Add `load_skill` tool for agents to load full skill content on-demand
- Support configurable skill directories via agent config (default: `.opencode/skills/`)
- Skill content returned wrapped in `<skill name="...">` tags for clear context injection

## Capabilities

### New Capabilities

- `skill-loading`: Two-layer skill injection system with on-demand loading via tools

### Modified Capabilities

## Impact

- `packages/core/src/agent/skills/` - New module for skill loading infrastructure
- `packages/core/src/agent/tools/` - New `list-skills-tool.ts` and `load-skill-tool.ts`
- `packages/core/src/types.ts` - Add `skillDirs` config option
- `packages/core/src/managers/manager-agent.ts` - Initialize skill registry and pass to tools
- Existing `.opencode/skills/` directory already contains skills in compatible format
