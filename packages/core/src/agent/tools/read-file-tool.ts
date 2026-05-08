import { tool } from "ai";
import mime from "mime-types";
import * as nodePath from "path";
import { z } from "zod";

import { getRemainingTokenBudget } from "../active-agent.js";

import { getFile, withDuration } from "./helpers.js";

import type { Sandbox, FileStat } from "../../environment";

// ============================================================================
// Constants
// ============================================================================

/** Maximum characters for text file content (to prevent context overflow) */
const MAX_CONTENT_LENGTH = 100000; // ~100KB, roughly 25k tokens

/** Maximum bytes for binary files (PDFs) */
const MAX_BINARY_SIZE = 10 * 1024 * 1024; // 10MB

/** Default line limit when not specified */
const DEFAULT_LINE_LIMIT = 2000;

/** Maximum characters per line before truncation */
const MAX_LINE_LENGTH = 2000;

/** Characters per token for budget estimation */
const CHARS_PER_TOKEN = 4;

// ============================================================================
// File Type Detection
// ============================================================================

type FileType = "text" | "image" | "pdf" | "directory" | "binary";

interface FileTypeInfo {
  type: FileType;
  mimeType?: string;
}

/**
 * Known binary file extensions that should never be read as text.
 * Based on OpenCode's approach - only list known binary types.
 */
const BINARY_EXTENSIONS = new Set([
  // Archives
  ".zip",
  ".tar",
  ".gz",
  ".7z",
  ".rar",
  ".bz2",
  ".xz",
  // Executables and libraries
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".bin",
  // Compiled code
  ".class",
  ".jar",
  ".war",
  ".pyc",
  ".pyo",
  ".wasm",
  ".o",
  ".a",
  ".lib",
  ".obj",
  // Office documents (binary formats)
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".odt",
  ".ods",
  ".odp",
  // Data files
  ".dat",
  ".db",
  ".sqlite",
  ".sqlite3",
]);

/**
 * Check if a file has a known binary extension
 */
function isBinaryExtension(filePath: string): boolean {
  const ext = nodePath.extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

/**
 * Detect file type based on MIME type and extension.
 *
 * Strategy (following OpenCode's approach):
 * 1. Use MIME type to detect images and PDFs
 * 2. Use extension list to detect known binary files
 * 3. Everything else is assumed to be text (with binary content check later)
 */
function detectFileType(filePath: string, stat?: FileStat): FileTypeInfo {
  // Check if it's a directory
  if (stat?.isDirectory) {
    return { type: "directory" };
  }

  // Get MIME type from extension
  const mimeType = mime.lookup(filePath) || undefined;

  // Check for images (supported for LLM vision)
  // Exclude SVG (XML-based, can be read as text) and vnd.fastbidsheet
  if (
    mimeType &&
    mimeType.startsWith("image/") &&
    mimeType !== "image/svg+xml" &&
    mimeType !== "image/vnd.fastbidsheet"
  ) {
    return { type: "image", mimeType };
  }

  // Check for PDF
  if (mimeType === "application/pdf") {
    return { type: "pdf", mimeType };
  }

  // Check for known binary extensions
  if (isBinaryExtension(filePath)) {
    return { type: "binary", mimeType };
  }

  // Everything else is assumed to be text
  // Binary content check will be done later when reading the file
  return { type: "text", mimeType };
}

/**
 * Check if file content appears to be binary by sampling the first bytes
 */
async function isBinaryContent(buffer: Buffer): Promise<boolean> {
  if (buffer.length === 0) return false;

  const sampleSize = Math.min(4096, buffer.length);
  let nonPrintableCount = 0;

  for (let i = 0; i < sampleSize; i++) {
    const byte = buffer[i];
    // Null byte is a strong indicator of binary
    if (byte === 0) return true;
    // Count non-printable characters (excluding common whitespace)
    if (byte < 9 || (byte > 13 && byte < 32)) {
      nonPrintableCount++;
    }
  }

  // If >30% non-printable characters, consider it binary
  return nonPrintableCount / sampleSize > 0.3;
}

// ============================================================================
// Output Schema
// ============================================================================

export const readFileOutputSchema = z.discriminatedUnion("type", [
  // Text file output
  z.object({
    type: z.literal("text"),
    path: z.string().describe("The file path that was read."),
    content: z.string().describe("The file content with line numbers."),
    modifiedTime: z.string().describe("ISO timestamp or hash of last modification."),
    totalLines: z.number().describe("Total number of lines in the file."),
    startLine: z.number().describe("Starting line number (1-indexed)."),
    endLine: z.number().describe("Ending line number (inclusive)."),
    linesReturned: z.number().describe("Number of lines returned."),
    truncated: z.boolean().describe("Whether content was truncated."),
    message: z.string().describe("Human-readable summary of the operation."),
    durationMs: z.number().describe("Execution duration in milliseconds."),
  }),
  // Directory output
  z.object({
    type: z.literal("directory"),
    path: z.string().describe("The directory path that was read."),
    entries: z.array(z.string()).describe("List of entries (files and directories)."),
    totalEntries: z.number().describe("Total number of entries."),
    entriesReturned: z.number().describe("Number of entries returned."),
    truncated: z.boolean().describe("Whether entries were truncated."),
    message: z.string().describe("Human-readable summary of the operation."),
    durationMs: z.number().describe("Execution duration in milliseconds."),
  }),
  // Image output
  z.object({
    type: z.literal("image"),
    path: z.string().describe("The image file path."),
    mimeType: z.string().describe("MIME type of the image."),
    base64: z.string().describe("Base64 encoded image data."),
    size: z.number().describe("File size in bytes."),
    message: z.string().describe("Human-readable summary of the operation."),
    durationMs: z.number().describe("Execution duration in milliseconds."),
  }),
  // PDF output
  z.object({
    type: z.literal("pdf"),
    path: z.string().describe("The PDF file path."),
    base64: z.string().describe("Base64 encoded PDF data."),
    size: z.number().describe("File size in bytes."),
    message: z.string().describe("Human-readable summary of the operation."),
    durationMs: z.number().describe("Execution duration in milliseconds."),
  }),
  // Error output
  z.object({
    type: z.literal("error"),
    path: z.string().describe("The file path that caused the error."),
    error: z.string().describe("Error message."),
    message: z.string().describe("Human-readable summary of the error."),
    durationMs: z.number().describe("Execution duration in milliseconds."),
  }),
]);

export type ReadFileOutput = z.infer<typeof readFileOutputSchema>;

// ============================================================================
// Tool Factory
// ============================================================================

/**
 * Creates a read-file tool using Vercel AI SDK.
 *
 * This tool reads file contents and supports multiple file types:
 * - Text files: Returns content with line numbers, supports offset/limit pagination
 * - Directories: Returns list of entries
 * - Images: Returns base64 encoded data for LLM vision capabilities
 * - PDFs: Returns base64 encoded data for document analysis
 * - Binary files: Returns error (cannot read binary files)
 */
export const createReadFileTool = ({ sandbox }: { sandbox: Sandbox }) => {
  return tool({
    description: `Read the contents of a file or directory.

Supports multiple file types:
- **Text files**: Returns content with line numbers. Use offset/limit for large files.
- **Directories**: Returns list of entries (files and subdirectories).
- **Images** (.png, .jpg, .jpeg, .gif, .webp): Returns image for visual analysis.
- **PDFs**: Returns PDF document for analysis.
- **Binary files**: Cannot be read (audio, video, archives, executables, etc.)

For text files, each line is prefixed with its line number (1-indexed).
Use the offset parameter to read from a specific line, and limit to control how many lines to read.

IMPORTANT: Reading images adds significant data to context. Avoid reading more than 2-3 images in a single turn. If you need to process many images, do them in separate turns.`,

    inputSchema: z.object({
      path: z.string().describe("The path to the file or directory to read, relative to the project root."),
      offset: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("The line number to start reading from (1-indexed). Only for text files. Defaults to 1."),
      limit: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe(
          "The maximum number of lines to read. Only for text files. Defaults to 2000. Use smaller values for targeted reading."
        ),
    }),

    outputSchema: readFileOutputSchema,

    execute: async ({ path: filePath, offset, limit }) => {
      return withDuration(async () => {
        const fsys = sandbox.filesystem;

        // Check if file/directory exists
        const exists = await fsys.exists(filePath);
        if (!exists) {
          // Try to find similar files for suggestion
          const dir = nodePath.dirname(filePath);
          const base = nodePath.basename(filePath).toLowerCase();
          let suggestion = "";

          try {
            const dirExists = await fsys.exists(dir);
            if (dirExists) {
              const entries = await fsys.readdir(dir);
              const similar = entries
                .filter((e) => e.name.toLowerCase().includes(base) || base.includes(e.name.toLowerCase().split(".")[0]))
                .slice(0, 3)
                .map((e) => nodePath.join(dir, e.name));

              if (similar.length > 0) {
                suggestion = `\n\nDid you mean one of these?\n${similar.join("\n")}`;
              }
            }
          } catch {
            // Ignore errors when looking for suggestions
          }

          return {
            type: "error" as const,
            path: filePath,
            error: `File not found: ${filePath}${suggestion}`,
            message: `File not found: ${filePath}`,
          };
        }

        // Get file stats if available
        let stat: FileStat | undefined;
        if (fsys.stat) {
          try {
            stat = await fsys.stat(filePath);
          } catch {
            // stat not available, continue without it
          }
        }

        // Detect file type
        const fileTypeInfo = detectFileType(filePath, stat);

        // Handle directory
        if (fileTypeInfo.type === "directory") {
          const entries = await fsys.readdir(filePath);
          const sortedEntries = entries
            .map((e) => (e.type === "directory" ? `${e.name}/` : e.name))
            .sort((a, b) => a.localeCompare(b));

          const startIdx = (offset ?? 1) - 1;
          const effectiveLimit = limit ?? DEFAULT_LINE_LIMIT;
          const slicedEntries = sortedEntries.slice(startIdx, startIdx + effectiveLimit);
          const truncated = startIdx + slicedEntries.length < sortedEntries.length;

          return {
            type: "directory" as const,
            path: filePath,
            entries: slicedEntries,
            totalEntries: sortedEntries.length,
            entriesReturned: slicedEntries.length,
            truncated,
            message: truncated
              ? `Directory ${filePath}: showing ${slicedEntries.length} of ${sortedEntries.length} entries. Use offset=${startIdx + slicedEntries.length + 1} to see more.`
              : `Directory ${filePath}: ${sortedEntries.length} entries`,
          };
        }

        // Handle binary files (error)
        if (fileTypeInfo.type === "binary") {
          return {
            type: "error" as const,
            path: filePath,
            error: `Cannot read binary file: ${filePath}. This tool cannot read binary files like audio, video, archives, or executables.`,
            message: `Cannot read binary file: ${filePath}`,
          };
        }

        // Handle images
        if (fileTypeInfo.type === "image") {
          if (!fsys.readFileBuffer) {
            return {
              type: "error" as const,
              path: filePath,
              error: "Image reading not supported in this environment",
              message: "Image reading not supported",
            };
          }

          const buffer = await fsys.readFileBuffer(filePath);

          // Check context budget — base64 is ~33% larger than raw bytes
          const base64Chars = Math.ceil(buffer.length * 1.37);
          const remainingTokens = getRemainingTokenBudget();
          const remainingChars = remainingTokens * CHARS_PER_TOKEN;
          if (base64Chars > remainingChars) {
            return {
              type: "error" as const,
              path: filePath,
              error: `Skipping image to avoid context overflow: ${Math.round(buffer.length / 1024)}KB image would use ~${Math.ceil(base64Chars / CHARS_PER_TOKEN)} tokens, but only ~${remainingTokens} tokens remain in budget. Try reading fewer images per turn.`,
              message: `Context budget exceeded, skipping: ${filePath} (${Math.round(buffer.length / 1024)}KB)`,
            };
          }

          const base64 = buffer.toString("base64");

          return {
            type: "image" as const,
            path: filePath,
            mimeType: fileTypeInfo.mimeType || "image/png",
            base64,
            size: buffer.length,
            message: `Image read successfully: ${filePath} (${Math.round(buffer.length / 1024)}KB)`,
          };
        }

        // Handle PDFs
        if (fileTypeInfo.type === "pdf") {
          if (!fsys.readFileBuffer) {
            return {
              type: "error" as const,
              path: filePath,
              error: "PDF reading not supported in this environment",
              message: "PDF reading not supported",
            };
          }

          const buffer = await fsys.readFileBuffer(filePath);

          if (buffer.length > MAX_BINARY_SIZE) {
            return {
              type: "error" as const,
              path: filePath,
              error: `PDF file too large: ${Math.round(buffer.length / 1024 / 1024)}MB (max ${MAX_BINARY_SIZE / 1024 / 1024}MB)`,
              message: `PDF file too large`,
            };
          }

          return {
            type: "pdf" as const,
            path: filePath,
            base64: buffer.toString("base64"),
            size: buffer.length,
            message: `PDF read successfully: ${filePath} (${Math.round(buffer.length / 1024)}KB)`,
          };
        }

        // Handle text files
        // Check for binary content if we can read buffer
        if (fsys.readFileBuffer) {
          try {
            const buffer = await fsys.readFileBuffer(filePath);
            if (await isBinaryContent(buffer)) {
              return {
                type: "error" as const,
                path: filePath,
                error: `File appears to be binary: ${filePath}. Cannot read binary file content.`,
                message: `Cannot read binary file: ${filePath}`,
              };
            }
          } catch {
            // If buffer read fails, try text read anyway
          }
        }

        // Read text file
        const fileRes = await getFile(sandbox, filePath);
        const modifiedTime = fileRes.modifiedTime;
        const content = fileRes.content;

        const lines = content.split("\n");
        const totalLines = lines.length;

        // Use 1-indexed offset (default to 1)
        const startLine = offset ?? 1;
        const startIdx = startLine - 1;

        // Validate offset
        if (startIdx >= totalLines && totalLines > 0) {
          return {
            type: "error" as const,
            path: filePath,
            error: `Offset ${startLine} is out of range for this file (${totalLines} lines)`,
            message: `Offset out of range`,
          };
        }

        // Apply line limit
        const effectiveLimit = limit ?? DEFAULT_LINE_LIMIT;
        const endIdx = Math.min(startIdx + effectiveLimit, totalLines);
        const selectedLines = lines.slice(startIdx, endIdx);

        // Truncate long lines and add line numbers
        let truncatedByLength = false;
        const numberedLines = selectedLines.map((line, idx) => {
          const lineNum = startIdx + idx + 1;
          if (line.length > MAX_LINE_LENGTH) {
            truncatedByLength = true;
            return `${lineNum}: ${line.slice(0, MAX_LINE_LENGTH)}... (line truncated)`;
          }
          return `${lineNum}: ${line}`;
        });

        let selectedContent = numberedLines.join("\n");

        // Truncate total content if too large (static cap)
        let contentTruncated = false;
        if (selectedContent.length > MAX_CONTENT_LENGTH) {
          selectedContent = selectedContent.slice(0, MAX_CONTENT_LENGTH) + "\n...[content truncated for context limit]";
          contentTruncated = true;
        }

        // Also truncate based on remaining context budget
        const remainingTokens = getRemainingTokenBudget();
        const remainingChars = remainingTokens * CHARS_PER_TOKEN;
        if (remainingChars <= 0) {
          return {
            type: "error" as const,
            path: filePath,
            error: `Context budget exhausted. Cannot read more files this turn. The file has ${totalLines} lines — try reading it in a subsequent turn or use offset/limit for a smaller range.`,
            message: `Context budget exhausted, skipping: ${filePath}`,
          };
        }
        if (selectedContent.length > remainingChars) {
          selectedContent =
            selectedContent.slice(0, remainingChars) + "\n...[content truncated: context budget limit reached]";
          contentTruncated = true;
        }

        const hasMore = endIdx < totalLines;
        const endLine = startIdx + selectedLines.length;

        let message = `Read ${selectedLines.length} lines from ${filePath} (lines ${startLine}-${endLine} of ${totalLines})`;
        if (contentTruncated || truncatedByLength) {
          message += " (some content truncated)";
        }
        if (hasMore) {
          message += `. Use offset=${endLine + 1} to read more.`;
        }

        return {
          type: "text" as const,
          path: filePath,
          content: selectedContent,
          modifiedTime,
          totalLines,
          startLine,
          endLine,
          linesReturned: selectedLines.length,
          truncated: contentTruncated || truncatedByLength || hasMore,
          message,
        };
      });
    },

    // Convert tool output to model-consumable content parts
    // This enables multi-modal results (images, PDFs) to be properly displayed by vision models
    toModelOutput({ output }: { toolCallId: string; input: unknown; output: ReadFileOutput }) {
      // Handle image output - convert to image-data content part for vision models
      if (output.type === "image") {
        return {
          type: "content" as const,
          value: [
            { type: "text" as const, text: output.message },
            {
              type: "image-data" as const,
              data: output.base64,
              mediaType: output.mimeType,
            },
          ],
        };
      }

      // Handle PDF output - convert to file-data content part
      if (output.type === "pdf") {
        return {
          type: "content" as const,
          value: [
            { type: "text" as const, text: output.message },
            {
              type: "file-data" as const,
              data: output.base64,
              mediaType: "application/pdf",
            },
          ],
        };
      }

      // For text, directory, and error outputs, use JSON serialization
      return {
        type: "json" as const,
        value: output,
      };
    },
  });
};
