import { execSync, spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ClipboardImageResult } from "@codent/app";

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
 * An empty Buffer therefore means "exited 0 with no output", which is the
 * success signal for commands that write to a file instead of stdout.
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
 * Decode a base64 PNG from any platform's clipboard into the shape the UI
 * expects, enforcing {@link IMAGE_SIZE_LIMIT}. Returns null for empty input or
 * an oversized image. Padding is restored because several clipboard sources
 * strip it.
 */
function toClipboardImage(rawBase64: string): ClipboardImageResult | null {
  const stripped = rawBase64.replace(/[\s\r\n]+/g, "");
  if (!stripped) return null;
  const padLen = (4 - (stripped.length % 4)) % 4;
  const base64 = padLen > 0 ? stripped + "=".repeat(padLen) : stripped;
  const size = Math.ceil((base64.length * 3) / 4);
  if (size > IMAGE_SIZE_LIMIT) return null;
  return { data: base64, mediaType: "image/png" };
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
  return toClipboardImage(data.toString("base64"));
}

/**
 * Read an image from the macOS clipboard via `osascript`, which writes the
 * clipboard's PNG data to a temp file (mirrors opencode). No native module is
 * involved: AppleScript is always present on macOS, whereas a prebuilt napi
 * binding only exists for the platforms its publisher shipped.
 */
async function readMacClipboardImage(): Promise<ClipboardImageResult | null> {
  const file = join(tmpdir(), `codent-clipboard-${process.pid}.png`);

  try {
    const written = await spawnBuffer("osascript", [
      "-e",
      'set imageData to the clipboard as "PNGf"',
      "-e",
      `set fileRef to open for access POSIX file "${file}" with write permission`,
      "-e",
      "set eof fileRef to 0",
      "-e",
      "write imageData to fileRef",
      "-e",
      "close access fileRef",
    ]);
    // `null` = osascript failed (no image on the clipboard, or no access).
    if (written === null) return null;
    return toClipboardImage((await readFile(file)).toString("base64"));
  } catch {
    return null;
  } finally {
    await rm(file, { force: true }).catch(() => {});
  }
}

/**
 * Read an image from the Windows clipboard via PowerShell +
 * `System.Windows.Forms.Clipboard`, emitting the PNG as base64 on stdout
 * (mirrors opencode). Same rationale as the macOS path: an OS tool that is
 * guaranteed present beats a native binding that may not exist for the user's
 * architecture.
 */
async function readWindowsClipboardImage(): Promise<ClipboardImageResult | null> {
  const script =
    "Add-Type -AssemblyName System.Windows.Forms; $img = [System.Windows.Forms.Clipboard]::GetImage(); " +
    "if ($img) { $ms = New-Object System.IO.MemoryStream; $img.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); " +
    "[System.Convert]::ToBase64String($ms.ToArray()) }";

  const out = await spawnBuffer("powershell.exe", ["-NonInteractive", "-NoProfile", "-command", script]);
  if (!out || out.length === 0) return null;
  return toClipboardImage(out.toString());
}

/**
 * Read an image from the system clipboard.
 *
 * Every platform goes through an OS tool rather than a native module: Linux
 * uses wl-paste / xclip, macOS uses osascript, Windows uses PowerShell. That
 * keeps the release bundle free of the platform-specific binary packages a
 * napi binding drags in — a single-package native dependency only ships
 * bindings for the targets its publisher chose, so it silently degrades to
 * "no image" on every other architecture (notably linux arm64).
 *
 * Returns null on any failure so the caller never has to handle a crash.
 */
export async function readClipboardImage(): Promise<ClipboardImageResult | null> {
  try {
    switch (process.platform) {
      case "linux":
        return await readLinuxClipboardImage();
      case "darwin":
        return await readMacClipboardImage();
      case "win32":
        return await readWindowsClipboardImage();
      default:
        return null;
    }
  } catch {
    return null;
  }
}
