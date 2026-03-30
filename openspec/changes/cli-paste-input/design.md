## Context

The CLI (`packages/cli/`) uses Ink (via `@my-react/react-terminal`) for its terminal UI. User input flows through `useInput()` in `Agent.tsx`, which receives individual characters and key events, then delegates to `useUserInput` state (reactivity-store). Messages are sent via `useLocalChat.sendMessage(content: string)` which wraps the AI SDK's `chatHelpers.sendMessage({ text })`.

Currently there is no support for:
- Detecting pasted content vs typed characters
- Attaching files or images to messages
- Sending multimodal content (text + images) to the agent

The AI SDK and the core agent already support multimodal messages (image parts, file parts) — the gap is entirely in the CLI input layer.

## Goals / Non-Goals

**Goals:**
- Allow users to paste file paths into the terminal input to attach files
- Support image files (png, jpg, gif, webp) as base64 image parts sent to the LLM
- Support text files as inline content attached to the message
- Show visual indicators for pending attachments before submission
- Allow removing attachments before submitting

**Non-Goals:**
- Clipboard image paste (raw image data from clipboard) — terminals don't support this natively
- Drag-and-drop from GUI file managers — behavior varies wildly across terminal emulators
- File upload to remote storage — files are read locally and sent inline
- Supporting very large files (>10MB) — these should be rejected with an error message
- Binary file support beyond images — only text and image files

## Decisions

### 1. File path detection strategy

**Decision**: Use an explicit `/attach <path>` command prefix and also detect standalone file paths (lines starting with `/` or `~/` that resolve to existing files).

**Rationale**: Paste detection (timing-based heuristics on stdin) is fragile across terminal emulators and Node.js versions. An explicit command is reliable. Additionally, detecting absolute paths that resolve to real files provides a natural UX for drag-and-drop (which pastes the path in most terminals).

**Alternatives considered**:
- Timing-based paste detection: Unreliable, varies by terminal and connection latency
- Only explicit `/attach` command: Misses the drag-and-drop use case where terminals paste the path

### 2. Attachment state management

**Decision**: Add an `attachments` array to `useUserInput` state alongside the existing `value` string.

**Rationale**: Attachments are conceptually part of the user's pending input, so they belong in the same state store. The `submit()` action returns both text and attachments, then clears both.

**Alternatives considered**:
- Separate `useAttachments` state store: Adds complexity with no benefit since attachments are always tied to the current input

### 3. Message format for multimodal content

**Decision**: Change `sendMessage` in `use-local-chat.ts` to accept `string | { text: string; attachments: Attachment[] }`. When attachments are present, construct AI SDK message parts (TextPart + ImagePart/FilePart).

**Rationale**: Minimal API change — existing string calls still work. The AI SDK already supports multi-part user messages.

### 4. Image encoding

**Decision**: Read image files with `fs.readFileSync()`, convert to base64 data URLs, and send as `ImagePart` with the appropriate MIME type.

**Rationale**: The AI SDK and LLM providers expect base64-encoded images. Node.js Buffer handles this natively without extra dependencies.

### 5. File type detection

**Decision**: Use file extension mapping (a simple map of extension → MIME type) rather than adding a dependency.

**Rationale**: We only need to distinguish a small set of image types (png, jpg, gif, webp, svg) from text files. A full `mime-types` package is overkill.

### 6. Attachment UI display

**Decision**: Show attached files as a compact list above the input line in the Footer component, with filename and file type indicator.

**Rationale**: Users need to see what's attached before submitting. Placing it above the input keeps it visible without disrupting the input flow.

## Risks / Trade-offs

- **[Large file memory usage]** → Mitigation: Enforce a 10MB file size limit; reject larger files with an error message. For text files, consider a 1MB limit.
- **[Path detection false positives]** → Mitigation: Only treat a line as a path if `fs.existsSync()` confirms it. The `/attach` command provides an unambiguous alternative.
- **[Terminal emulator variance]** → Mitigation: Avoid timing-based heuristics entirely. Rely on explicit commands and path resolution which work identically everywhere.
- **[Image token cost]** → Mitigation: Show file size in the attachment indicator so users are aware. No automatic resizing — let the LLM provider handle that.
