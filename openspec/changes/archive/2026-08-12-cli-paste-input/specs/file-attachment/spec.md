## ADDED Requirements

### Requirement: Image file attachment
The system SHALL support attaching image files (png, jpg, jpeg, gif, webp) and encoding them as base64 image parts for the LLM.

#### Scenario: Attach a PNG image
- **WHEN** user attaches a file with `.png` extension
- **THEN** the system SHALL read the file, encode it as a base64 data URL with MIME type `image/png`, and include it as an ImagePart in the message sent to the agent

#### Scenario: Attach a JPEG image
- **WHEN** user attaches a file with `.jpg` or `.jpeg` extension
- **THEN** the system SHALL read the file, encode it as base64 with MIME type `image/jpeg`, and include it as an ImagePart

### Requirement: Text file attachment
The system SHALL support attaching text-based files and including their content inline in the message.

#### Scenario: Attach a text file
- **WHEN** user attaches a file with a text-based extension (`.txt`, `.md`, `.ts`, `.js`, `.json`, `.yaml`, `.yml`, `.toml`, `.xml`, `.html`, `.css`, `.py`, `.rs`, `.go`, `.sh`, `.log`, `.csv`, `.env`, `.sql`)
- **THEN** the system SHALL read the file as UTF-8 text and include it in the message as a text part, prefixed with the filename

#### Scenario: Attach an unknown extension
- **WHEN** user attaches a file with an unrecognized extension
- **THEN** the system SHALL attempt to read it as UTF-8 text; if it contains valid text, attach as text; otherwise display an error that the file type is not supported

### Requirement: File size limits
The system SHALL enforce file size limits to prevent excessive memory usage and token cost.

#### Scenario: Image file exceeds 10MB
- **WHEN** user attempts to attach an image file larger than 10MB
- **THEN** the system SHALL reject the attachment with an error message indicating the size limit

#### Scenario: Text file exceeds 1MB
- **WHEN** user attempts to attach a text file larger than 1MB
- **THEN** the system SHALL reject the attachment with an error message indicating the size limit

#### Scenario: File within limits
- **WHEN** user attaches a file within the size limits
- **THEN** the system SHALL accept and process the attachment normally

### Requirement: Attachment display
The CLI SHALL display pending attachments visually so the user can see what will be sent.

#### Scenario: Show attached files
- **WHEN** one or more files are attached
- **THEN** the Footer area SHALL display a list of attached files showing filename, file type icon/label, and file size

#### Scenario: No attachments
- **WHEN** no files are attached
- **THEN** no attachment indicator SHALL be displayed (no extra space used)

### Requirement: Multimodal message construction
The `sendMessage` function SHALL support sending messages with both text and file/image attachments to the agent.

#### Scenario: Send message with image attachment
- **WHEN** a message is submitted with an image attachment
- **THEN** the system SHALL construct an AI SDK message with a TextPart (user's text) and an ImagePart (base64-encoded image data with correct MIME type)

#### Scenario: Send message with text file attachment
- **WHEN** a message is submitted with a text file attachment
- **THEN** the system SHALL construct a message with the user's text followed by the file content (formatted with filename header)

#### Scenario: Send message with multiple attachments
- **WHEN** a message is submitted with multiple attachments (mixed text and image files)
- **THEN** the system SHALL include all attachments as separate parts in the correct order
