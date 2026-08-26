import { execSync, spawn } from "node:child_process";

import type { ClipboardImageResult } from "@my-agent/app";

const IMAGE_SIZE_LIMIT = 10 * 1024 * 1024; // 10MB

/**
 * Detected Linux clipboard tool, cached across calls.
 * `undefined` = not detected yet; `null` = no usable tool/session.
 */
let linuxClipboardTool: "wl-paste" | "xclip" | null | undefined;

/**
 * Detect the Linux clipboard tool for the current display server (mirrors
 * gemini-cli). Wayland -> `wl-paste`, X11 -> `xclip`. Verifies the binary is
 * installed with `command -v` so a missing tool fails softly instead of
 * crashing the CLI (the previous native binding could segfault).
 */
function detectLinuxClipboardTool(): "wl-paste" | "xclip" | null {
  if (linuxClipboardTool !== undefined) return linuxClipboardTool;

  const session = process.env.XDG_SESSION_TYPE;
  const tool = session === "wayland" ? "wl-paste" : session === "x11" ? "xclip" : null;

  if (!tool) {
    linuxClipboardTool = null;
    return null;
  }

  try {
    execSync(`command -v ${tool}`, { stdio: "ignore" });
    linuxClipboardTool = tool;
    return tool;
  } catch {
    linuxClipboardTool = null;
    return null;
  }
}

/**
 * Run a command and collect stdout as a Buffer, capped at IMAGE_SIZE_LIMIT.
 * Resolves null (never throws) if the process fails to spawn or exits non-zero.
 */
function spawnBuffer(command: string, args: string[]): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "ignore"] });
    const chunks: Buffer[] = [];
    let total = 0;
    let resolved = false;

    const safeResolve = (value: Buffer | null) => {
      if (!resolved) {
        resolved = true;
        resolve(value);
      }
    };

    child.stdout.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > IMAGE_SIZE_LIMIT) {
        child.kill();
        safeResolve(null);
      } else {
        chunks.push(chunk);
      }
    });

    child.on("error", () => safeResolve(null));
    child.on("close", (code) => {
      if (code !== 0) {
        safeResolve(null);
        return;
      }
      safeResolve(Buffer.concat(chunks));
    });
  });
}

/**
 * Read an image from the Linux clipboard via wl-paste (Wayland) or xclip
 * (X11), mirroring gemini-cli. Returns null — never throws — when the display
 * session or tool is unavailable, so pasting cannot crash the CLI.
 */
async function readLinuxClipboardImage(): Promise<ClipboardImageResult | null> {
  const tool = detectLinuxClipboardTool();
  if (!tool) return null;

  const data = await (tool === "wl-paste"
    ? spawnBuffer("wl-paste", ["--no-newline", "--type", "image/png"])
    : spawnBuffer("xclip", ["-selection", "clipboard", "-t", "image/png", "-o"]));

  if (!data || data.length === 0) return null;
  return { data: data.toString("base64"), mediaType: "image/png" };
}

/**
 * Read an image from the system clipboard.
 * - Linux: wl-paste / xclip (no native binding — see {@link readLinuxClipboardImage}).
 * - macOS/Windows: the `@crosscopy/clipboard` native binding, imported lazily
 *   (only off-Linux, since the binding can segfault in headless environments).
 * Returns null on any failure so the caller never has to handle a crash.
 */
export async function readClipboardImage(): Promise<ClipboardImageResult | null> {
  if (process.platform === "linux") {
    return readLinuxClipboardImage();
  }

  try {
    const { getImageBase64, hasImage } = await import("@crosscopy/clipboard");
    if (!hasImage()) return null;
    const rawBase64 = await getImageBase64();
    if (!rawBase64) return null;
    const stripped = rawBase64.replace(/[\s\r\n]+/g, "");
    if (!stripped) return null;
    const padLen = (4 - (stripped.length % 4)) % 4;
    const base64 = padLen > 0 ? stripped + "=".repeat(padLen) : stripped;
    const size = Math.ceil((base64.length * 3) / 4);
    if (size > IMAGE_SIZE_LIMIT) return null;
    return { data: base64, mediaType: "image/png" };
  } catch {
    return null;
  }
}
