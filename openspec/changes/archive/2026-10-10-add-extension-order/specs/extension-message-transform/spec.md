## MODIFIED Requirements

### Requirement: Transformer chaining, ordering, and failure isolation

Multiple transformers SHALL run sequentially in the declaring extension's declared dispatch order (lower first, load sequence as the tie-break), each receiving the previous transformer's output. Transformer errors SHALL be contained: the system SHALL log a warning naming the extension, SHALL retain the last valid message set, and SHALL continue with any remaining transformers and with the run. A transformer return value that is not an array of messages SHALL be treated as invalid and SHALL likewise retain the last valid message set.

#### Scenario: Output chains

- **WHEN** extension A's transformer returns messages `[m1]` and extension B's transformer returns messages `[m2]`
- **THEN** the model SHALL receive `[m2]`

#### Scenario: Throwing transformer does not break the run

- **WHEN** a transformer throws
- **THEN** a warning SHALL be logged with the extension id, the message set SHALL be the last valid one, and the run SHALL continue

#### Scenario: Invalid return is ignored

- **WHEN** a transformer returns a non-array value
- **THEN** the last valid message set SHALL be used and a warning SHALL be logged

#### Scenario: Declared order decides which transformer sees whose output

- **WHEN** extension A is loaded first and declares a higher order than extension B, and both register a transformer
- **THEN** B's transformer is invoked first and A's receives B's output, because the chain follows declared order rather than load order

#### Scenario: Undeclared transformers keep their existing chain

- **WHEN** every registered transformer belongs to an extension with no declared order
- **THEN** the chain is the load order, exactly as before declared order existed
