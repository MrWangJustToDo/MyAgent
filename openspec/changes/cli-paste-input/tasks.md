## 1. Attachment State & Types

- [x] 1.1 Define `Attachment` type (path, filename, mimeType, type: "image" | "text", size, content: string | Buffer) in a new `packages/cli/src/types/attachment.ts`
- [x] 1.2 Add `attachments: Attachment[]` to `useUserInput` state and actions: `addAttachment`, `removeAttachment`, `clearAttachments`
- [x] 1.3 Update `submit()` action to return `{ text: string; attachments: Attachment[] }` and clear attachments on submit

## 2. File Processing Utilities

- [x] 2.1 Create `packages/cli/src/utils/file-attachment.ts` with MIME type map (extension → MIME), `isImageFile()`, `isTextFile()` helpers
- [x] 2.2 Implement `resolveAttachment(filePath: string): Attachment` — validates path exists, checks size limits (10MB image, 1MB text), reads content, determines type
- [x] 2.3 Handle unknown extensions: attempt UTF-8 read, check for binary content, return error if unsupported

## 3. Input Command Handling

- [x] 3.1 Add `/attach <path>` command detection in `Agent.tsx` `handleSubmit` — intercept before `sendMessage`, call `resolveAttachment`, add to state
- [x] 3.2 Add `/unattach <index|all>` command to remove attachments
- [x] 3.3 Add file path auto-detection: when input is a standalone absolute path (`/...` or `~/...`) that resolves to an existing file, attach instead of sending as text

## 4. Multimodal Message Sending

- [x] 4.1 Update `sendMessage` in `use-local-chat.ts` to accept `string | { text: string; attachments: Attachment[] }`
- [x] 4.2 Construct AI SDK message parts: TextPart for text, ImagePart (base64 data URL) for images, TextPart with filename header for text files
- [x] 4.3 Update `handleSubmit` in `Agent.tsx` to pass attachments from `useUserInput` state to `sendMessage`

## 5. Attachment UI

- [x] 5.1 Create `packages/cli/src/components/AttachmentList.tsx` — renders pending attachments with filename, type label, and size
- [x] 5.2 Integrate `AttachmentList` into `Footer.tsx` — show above the input line when attachments exist
- [x] 5.3 Show error messages inline when file validation fails (size limit, unsupported type, not found)

## 6. Validation & Build

- [x] 6.1 Run `pnpm typecheck` and fix any type errors
- [x] 6.2 Run `pnpm lint` and `pnpm format`
- [x] 6.3 Run `pnpm build` and verify successful build
