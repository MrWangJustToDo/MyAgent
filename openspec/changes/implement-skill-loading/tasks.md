## 1. Skill Types and Schemas

- [x] 1.1 Create `packages/core/src/agent/skills/types.ts` with `SkillMetadata` and `Skill` interfaces
- [x] 1.2 Add Zod schemas for skill frontmatter validation (`skillMetadataSchema`)
- [x] 1.3 Export types from `packages/core/src/agent/skills/index.ts`

## 2. Skill Loader Implementation

- [x] 2.1 Create `packages/core/src/agent/skills/skill-loader.ts` with `SkillLoader` class
- [x] 2.2 Implement `parseFrontmatter(text)` method to extract YAML frontmatter and body
- [x] 2.3 Implement `loadFromDirectory(path)` method to scan for SKILL.md files
- [x] 2.4 Handle edge cases: missing frontmatter, invalid YAML, non-existent directory
- [x] 2.5 Add warning logging for skipped files and duplicate skill names

## 3. Skill Registry Implementation

- [x] 3.1 Create `packages/core/src/agent/skills/skill-registry.ts` with `SkillRegistry` class
- [x] 3.2 Implement `loadFromDirectories(paths, rootPath)` to load skills from multiple directories
- [x] 3.3 Implement `list()` method returning skill metadata array
- [x] 3.4 Implement `get(name)` method returning full skill or undefined
- [x] 3.5 Implement `getDescriptions()` method for formatted skill list output

## 4. Skill Tools Implementation

- [x] 4.1 Create `packages/core/src/agent/tools/list-skills-tool.ts` with `createListSkillsTool`
- [x] 4.2 Implement list_skills tool that calls `registry.list()` and formats output
- [x] 4.3 Create `packages/core/src/agent/tools/load-skill-tool.ts` with `createLoadSkillTool`
- [x] 4.4 Implement load_skill tool that calls `registry.get()` and wraps in `<skill>` tags
- [x] 4.5 Handle error case when skill not found (return available skill names)
- [x] 4.6 Export skill tools from `packages/core/src/agent/tools/index.ts`

## 5. Agent Configuration

- [x] 5.1 Add `skillDirs?: string[]` to agent config types in `packages/core/src/types.ts`
- [x] 5.2 Set default value `[".opencode/skills"]` when not specified

## 6. Agent Manager Integration

- [x] 6.1 Create `SkillRegistry` instance in `AgentManager` or during agent creation
- [x] 6.2 Load skills from configured directories (resolve relative paths to rootPath)
- [x] 6.3 Pass `SkillRegistry` to skill tool factories when creating tools
- [x] 6.4 Add skill tools to agent's tool set

## 7. Documentation and Exports

- [x] 7.1 Export skill types and registry from `packages/core/src/agent/index.ts`
- [x] 7.2 Add JSDoc documentation to SkillLoader and SkillRegistry classes
- [x] 7.3 Update AGENTS.md with skill system documentation

## 8. Verification

- [x] 8.1 Verify existing `.opencode/skills/` files are parsed correctly
- [x] 8.2 Test list_skills returns skill names and descriptions
- [x] 8.3 Test load_skill returns wrapped skill content
- [x] 8.4 Run build to verify no type errors
