# transcript-static-render Specification

## Purpose

Per-item static rendering of the transcript: each row caches its own rendered output, so a re-render touches only the rows whose state actually changed.

## Requirements
### Requirement: Per-row static cache unit

Each rendered completed-transcript row SHALL be cached as its own `<StaticRender>`
instance with a terminal-width layout, so that invalidating one row SHALL NOT re-lay-out
or re-render any other row. No single static render instance SHALL span more than one
history row.

#### Scenario: One row's state advances

- **WHEN** a single completed row's invalidation signature changes (for example a tool
  call on that row reaches a new state)
- **THEN** only that row's static cache SHALL be invalidated and re-cached, and the
  remaining rows SHALL keep their existing cached output

#### Scenario: Independent row edits

- **WHEN** two distinct rows each change their own signature in the same update
- **THEN** exactly those two rows SHALL be re-cached, and no other row SHALL be re-cached

#### Scenario: Row set grows

- **WHEN** new completed rows are appended to the end of the transcript
- **THEN** previously rendered rows SHALL keep their caches and only the newly added rows
  SHALL be cached

### Requirement: Per-row invalidation signature

The static row list SHALL carry one invalidation signature per row, derived from that
row's own message content. The system SHALL NOT use a globally joined signature over the
whole completed transcript as a dependency of any row's cache.

#### Scenario: Unrelated row changes

- **WHEN** a row that sorts before the cached row set changes state
- **THEN** the unchanged rows SHALL NOT be invalidated by that change alone

#### Scenario: Same content, same signature

- **WHEN** the completed transcript is re-derived with identical message content
- **THEN** every row SHALL produce the same signature as before and no row SHALL be
  re-cached

#### Scenario: Content rewritten under a stable id

- **WHEN** a row's message keeps its id but its rendered content is replaced
- **THEN** that row's signature SHALL change so its cache is invalidated rather than
  pinning the previous render

### Requirement: Line-based truncation budget

Truncation of the completed transcript SHALL be governed by a budget expressed in
rendered **lines**, not in message count. Rows SHALL be selected newest-first and
included while their measured heights fit the budget; the first row that would exceed the
budget and all older rows SHALL be excluded.

#### Scenario: Tall rows exhaust the budget sooner than many short rows

- **WHEN** a completed transcript renders many lines per message and the accumulated
  measured height reaches the line budget
- **THEN** the system SHALL exclude the remaining older rows even though their message
  count is below any previous message-count cap

#### Scenario: Many short rows fit

- **WHEN** a completed transcript consists of many low-height rows whose accumulated
  measured height stays within the line budget
- **THEN** the system SHALL include all of them even though their message count exceeds
  any previous message-count cap

#### Scenario: Budget on a row boundary

- **WHEN** including the next older row would push the accumulated height past the budget
- **THEN** the system SHALL exclude that whole row rather than partially rendering it

### Requirement: Conservative truncation while heights are unmeasured

Rows whose measured height is not yet known SHALL be granted a provisional allowance that
permits rendering, so that a cold render SHALL NOT truncate history it has not measured.
The budget SHALL become exact only as measurements arrive.

#### Scenario: Session resumed with no cached heights

- **WHEN** a session is resumed and no row height has been measured yet
- **THEN** the system SHALL render no fewer rows than the line budget would allow using
  provisional allowances, and SHALL NOT drop history merely because heights are unknown

#### Scenario: Measurements arrive after first paint

- **WHEN** measured heights become available for rows that carried provisional allowances
- **THEN** subsequent truncation decisions SHALL use the measured heights

### Requirement: Single-unit truncation marker

The truncation marker SHALL report only the number of source messages behind the excluded
rows, in one unit, and SHALL NOT mix message counts with rendered-row counts. The marker
SHALL be rendered inside the cached completed-transcript region.

#### Scenario: Rows dropped by the line budget

- **WHEN** the line budget excludes the oldest rows
- **THEN** the marker SHALL report the source-message count behind the excluded rows and
  SHALL include the messages already dropped by the static input window

#### Scenario: Nothing dropped

- **WHEN** every completed row fits within the line budget and the static input window
  dropped nothing
- **THEN** no truncation marker SHALL be rendered

