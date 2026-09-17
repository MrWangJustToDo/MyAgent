# tool-presentation Specification

## Purpose
TBD - created by archiving change unify-tool-presentation-in-core. Update Purpose after archive.
## Requirements
### Requirement: Per-tool presentation descriptors live in core

Every tool SHALL declare its presentation metadata in core, either at definition time or through a registration API. Hosts SHALL NOT maintain tool-name tables of their own.

#### Scenario: Built-in tool declares its presentation

- **WHEN** a built-in tool is defined
- **THEN** it declares its own category, keep-row/detailed flags, summary, label, result text, and input text alongside its name, schema, and execute function

#### Scenario: Runtime tool registers its presentation

- **WHEN** a tool registers after startup (extension or custom tool)
- **THEN** its presentation metadata is registered in the same registry as built-ins, without touching host code

#### Scenario: Single declaration surface

- **WHEN** any tool declares how it is displayed
- **THEN** it uses one `present` descriptor, and no second display surface exists for tools or hosts (the former `toUI` / `display` fields are gone)

#### Scenario: Resolution order

- **WHEN** no presentation metadata is registered for a tool name
- **THEN** core falls back to its built-in table, and then to generic defaults (`category: "other"`, no summary/label/text)

### Requirement: Fold and row-visibility rules are owned by core

Core SHALL decide which completed tool rows stay visible in compact display and which fold into an activity summary. Error and denial states SHALL fold (counted as errors) rather than remain rows.

#### Scenario: Structured tool row stays visible

- **WHEN** a tool whose descriptor keeps its row completes successfully
- **THEN** its row remains in compact display

#### Scenario: Tool with a result renderer keeps its row

- **WHEN** a completed tool has a result-text renderer
- **THEN** its row remains visible in compact display and its text is rendered by the host

#### Scenario: Errored row folds

- **WHEN** a tool call failed or was denied
- **THEN** it folds into the activity summary as an error count instead of remaining a row

#### Scenario: Unbucketed tools are named

- **WHEN** a folded run contains tools with no specific category
- **THEN** the summary names them by tool name instead of printing an opaque generic count

### Requirement: Tool presentation metadata ships to hosts as data

Core SHALL publish a serializable projection of the descriptor registry (no functions) as part of the session snapshot, so hosts can render rows before any per-call payload exists.

#### Scenario: Catalog contents

- **WHEN** a host reads the session snapshot
- **THEN** it receives one entry per known tool with category, keep-row/detailed/client-side flags, and whether summary/text renderers exist

#### Scenario: Extension tools are attributed

- **WHEN** an extension registers tools
- **THEN** the catalog and the extension snapshot entry both expose those tool names and their metadata

#### Scenario: Disabled extension drops out

- **WHEN** an extension is disabled
- **THEN** its tools disappear from the catalog

#### Scenario: Cross-process hosts

- **WHEN** the session runs against a remote core (server snapshot route / remote session client)
- **THEN** the catalog is transported intact

### Requirement: Core computes a per-call display payload

On tool completion, core SHALL compute the tool's display payload (result text, header summary, activity label) from the stored output and attach it to that tool-call part.

#### Scenario: Payload attached at completion

- **WHEN** a tool with a result renderer completes
- **THEN** its tool-call part carries the rendered text (and summary/label when available) without any host-side registry lookup

#### Scenario: Deterministic

- **WHEN** the same tool result is rendered twice
- **THEN** the payload is identical

#### Scenario: No renderer, no payload

- **WHEN** a tool has no result renderer
- **THEN** no payload is attached and hosts fall back to the catalog for row/block treatment

#### Scenario: Payload survives part rebuilds

- **WHEN** hosts dedupe, merge, or re-project messages
- **THEN** the payload is preserved (including when only the duplicate part carried it)

#### Scenario: Host caches invalidate on payload change

- **WHEN** a part's payload changes while identity, state, and output stay the same
- **THEN** host render caches and list signatures treat the row as changed

### Requirement: Display payload never reaches the model

The display payload SHALL be a host-facing projection only; model-facing tool content SHALL continue to be produced by the model-output transform.

#### Scenario: Model messages exclude it

- **WHEN** UI messages are converted to model messages
- **THEN** the display payload is absent from the produced content

### Requirement: Hosts render presentation only

Hosts SHALL own colors, layout, and interactive views; tool-specific text and row decisions SHALL come from core.

#### Scenario: Adding a built-in tool

- **WHEN** a new built-in tool is added
- **THEN** no host-side table or switch needs to change for it to render correctly

