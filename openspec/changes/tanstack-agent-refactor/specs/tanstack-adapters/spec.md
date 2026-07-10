## ADDED Requirements

### Requirement: Model factory produces TanStack text adapters

The system SHALL provide `createTextAdapter(config)` returning `{ adapter: AnyTextAdapter, model: string }` for use with `chat()`.

#### Scenario: Ollama provider

- **WHEN** provider type is `ollama`
- **THEN** the factory returns an adapter from `@tanstack/ai-ollama` (`ollamaText()`)
- **AND** the model string matches the configured model name

#### Scenario: OpenAI provider

- **WHEN** provider type is `openai`
- **THEN** the factory returns an adapter from `@tanstack/ai-openai` (`openaiText()`)
- **AND** API key and base URL from environment are applied

#### Scenario: OpenRouter provider

- **WHEN** provider type is `open-router`
- **THEN** the factory returns an adapter from `@tanstack/ai-openrouter`
- **AND** the model string matches the OpenRouter model id

### Requirement: Adapter factory replaces Vercel LanguageModel

The system SHALL NOT require Vercel `LanguageModel` instances for the agent loop after migration.

#### Scenario: ManagedAgent uses adapter config

- **WHEN** `AgentManager.createManagedAgent()` is called
- **THEN** it resolves adapter and model via `createTextAdapter()`
- **AND** passes them to `AgentRunner` configuration
- **AND** does not call Vercel `createOpenAI()` or `wrapLanguageModel()`

### Requirement: Model metadata remains available

The system SHALL continue resolving `ModelInfo` from the registry for compaction thresholds, pricing, and capabilities.

#### Scenario: Model info for compaction

- **WHEN** a managed agent is created with a known model id
- **THEN** `ModelInfo` is attached to `ManagedAgent.context`
- **AND** compaction middleware uses `maxTokens` from model info when configured

### Requirement: OpenAI-compatible fallback

The system SHALL support `openai-compatible` provider type via TanStack OpenAI adapter with custom `baseURL`.

#### Scenario: Custom OpenAI-compatible endpoint

- **WHEN** provider type is `openai-compatible` with a custom base URL
- **THEN** the factory configures the OpenAI text adapter with that base URL
- **AND** chat requests route to the compatible endpoint
