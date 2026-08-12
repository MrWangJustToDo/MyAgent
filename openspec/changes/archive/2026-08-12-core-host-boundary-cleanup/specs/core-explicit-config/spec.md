## ADDED Requirements

### Requirement: Core model resolution is explicit-only
`@my-agent/core` model connection resolution SHALL accept only explicit fields (`model`, `style`, `baseURL`, `apiKey`, `modelInfo`). It MUST NOT read LLM configuration from an environment-variable bag or from `CoreEnv.getEnv()`.

#### Scenario: Provider registration without env bag
- **WHEN** a host registers `createDirectModelProvider` with `{ model, style, baseURL, apiKey }`
- **THEN** the provider connection SHALL use those fields
- **AND** SHALL NOT require or accept a process env map for resolution

#### Scenario: Missing required field fails loudly
- **WHEN** `baseURL` is empty for a style that requires it
- **THEN** adapter/provider creation SHALL throw an error instructing the caller to pass `baseURL` explicitly

### Requirement: Host owns env and flag parsing
Parsing of dotenv / `process.env` / CLI flags into model connection and metadata SHALL occur in host packages (e.g. `@my-agent/cli`), not in `@my-agent/core` public model APIs.

#### Scenario: MODEL_* metadata
- **WHEN** a CLI user sets `MODEL_*` environment variables
- **THEN** the CLI (or other host) SHALL parse them into `ModelInfo` before calling core
- **AND** core SHALL NOT export `parseModelInfoFromEnv` / `MODEL_ENV_KEYS` on the public package entry

### Requirement: models.dev lookup remains in core
Core MAY look up model metadata from models.dev (or cache) given an explicit model id, and merge with caller-provided `modelInfo`.

#### Scenario: Lookup with explicit id
- **WHEN** `resolveModelConfig` is called with a non-empty `model` and no env bag
- **THEN** core MAY enrich `modelInfo` via models.dev
- **AND** caller-provided `modelInfo` fields SHALL override lookup results where both exist

### Requirement: Tool secrets are injected explicitly
Tools that need API keys (e.g. Brave websearch) SHALL receive secrets via agent/tool configuration supplied at construction time. They MUST NOT read secret key names from `CoreEnv.getEnv()` for credential resolution.

#### Scenario: Brave without CoreEnv secret dig
- **WHEN** Brave search runs and no brave API key was configured on the agent/tool config
- **THEN** the tool SHALL fail or fall back per documented policy without reading `BRAVE_API_KEY` from CoreEnv env maps

### Requirement: CoreEnv.getEnv is not an LLM config channel
`CoreEnv.getEnv()` SHALL be documented and used only for workspace/process environment (e.g. child shell). It MUST NOT be treated as the source of ModelProvider credentials.

#### Scenario: Documentation / boundary
- **WHEN** hosts configure LLM access
- **THEN** they SHALL use ModelProvider / explicit Host.create fields
- **AND** NOT rely on CoreEnv env maps for `API_KEY` / `BASE_URL`
