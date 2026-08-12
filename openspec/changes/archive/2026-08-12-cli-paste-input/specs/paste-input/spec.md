## ADDED Requirements

### Requirement: Attach command support
The CLI SHALL support an `/attach <path>` command that adds a file as an attachment to the current message being composed.

#### Scenario: Attach a valid file
- **WHEN** user types `/attach /path/to/file.txt` and presses Enter
- **THEN** the file SHALL be added to the attachments list and the input SHALL be cleared (not submitted as a message)

#### Scenario: Attach a nonexistent file
- **WHEN** user types `/attach /path/to/nonexistent.txt` and presses Enter
- **THEN** the system SHALL display an error message indicating the file does not exist and SHALL NOT add any attachment

#### Scenario: Attach with no path
- **WHEN** user types `/attach` with no file path
- **THEN** the system SHALL display a usage hint: `/attach <file-path>`

### Requirement: File path auto-detection
The CLI SHALL detect when the input value is a standalone absolute file path (starting with `/` or `~/`) that resolves to an existing file, and offer to attach it.

#### Scenario: Paste an absolute file path
- **WHEN** user pastes or types an absolute path like `/Users/me/screenshot.png` and presses Enter
- **THEN** the system SHALL check if the path exists, and if so, attach the file instead of sending the path as a text message

#### Scenario: Path does not exist
- **WHEN** user enters a path-like string that does not resolve to an existing file
- **THEN** the system SHALL send it as a normal text message (no attachment behavior)

### Requirement: Remove attachment
The CLI SHALL allow users to remove a pending attachment before submitting.

#### Scenario: Remove attachment by index
- **WHEN** user types `/unattach <index>` (1-based) while attachments are pending
- **THEN** the attachment at that index SHALL be removed from the list

#### Scenario: Clear all attachments
- **WHEN** user types `/unattach all`
- **THEN** all pending attachments SHALL be removed

### Requirement: Submit with attachments
When the user submits a message (presses Enter with text input), any pending attachments SHALL be included alongside the text content.

#### Scenario: Submit text with attachments
- **WHEN** user has one or more attachments and types a message then presses Enter
- **THEN** the message SHALL be sent with both the text content and all attachment data, and attachments SHALL be cleared after submission

#### Scenario: Submit attachments with no text
- **WHEN** user has attachments but empty text input and presses Enter
- **THEN** the message SHALL be sent with only the attachments (empty text is acceptable)
