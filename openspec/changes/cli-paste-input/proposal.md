## Why

The CLI currently only accepts plain text input typed character-by-character. Users frequently need to share files (code, logs, configs) or images (screenshots, diagrams) with the agent for context. Today they must use workarounds like shell redirection or manually describing image content. Supporting file/image paste directly in the terminal input would make the CLI much more practical for real-world workflows.

## What Changes

- Add paste detection in the terminal input layer to distinguish between typed characters and pasted content
- Support pasting file paths — detect and resolve pasted file/image paths, read the file content, and attach it to the message
- Support drag-and-drop of files into the terminal (terminals emit the file path as pasted text)
- Support image file attachments — when a pasted path points to an image (png, jpg, gif, webp, svg), encode it as a base64 image part in the message sent to the agent
- Support text file attachments — when a pasted path points to a text file, include its content inline in the message
- Extend `sendMessage` in `use-local-chat` to accept multimodal content (text + file parts + image parts) instead of just a string
- Add visual indicators in the input area showing attached files before submission

## Capabilities

### New Capabilities
- `paste-input`: Detection of pasted content in terminal input, including multi-line text and file paths
- `file-attachment`: Reading, validating, and attaching files (text and images) to agent messages from the CLI

### Modified Capabilities

## Impact

- **`packages/cli/src/app/Agent.tsx`** — Input handling logic needs paste detection and file resolution
- **`packages/cli/src/hooks/use-user-input.ts`** — State needs to track attached files alongside text input
- **`packages/cli/src/hooks/use-local-chat.ts`** — `sendMessage` signature changes from `string` to support multimodal content
- **`packages/cli/src/components/UserInput.tsx`** — Needs to render attachment indicators
- **`packages/cli/src/layout/Footer.tsx`** — Layout may need adjustment for attachment display
- **Dependencies** — May need `mime-types` or similar for file type detection; image encoding uses Node.js `fs` and `Buffer` (already available)
