#!/usr/bin/env node
/**
 * Slow-initialize mock LSP server — delays the `initialize` response by
 * SLOW_MS (default 2000ms). Used to exercise the mid-startup shutdown path:
 * when a session ends while a server is still handshaking, the LSP manager must
 * still tear the child process down (it is not yet in `clients`).
 */

const SLOW_MS = Number(process.env.SLOW_MS ?? 2000);

function send(msg) {
  const body = JSON.stringify(msg);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, "utf-8")}\r\n\r\n${body}`);
}
function reply(id, result) {
  send({ jsonrpc: "2.0", id, result });
}
function notify(method, params) {
  send({ jsonrpc: "2.0", method, params });
}

function handleMessage(msg) {
  if (!msg || typeof msg !== "object") return;
  const { id, method } = msg;

  if (id === undefined || id === null) {
    if (method === "exit") process.exit(0);
    return;
  }

  switch (method) {
    case "initialize": {
      // The whole point: delay the handshake so the client sees a "starting" server.
      setTimeout(() => {
        reply(id, {
          capabilities: { textDocumentSync: 1 },
          serverInfo: { name: "slow-mock-lsp", version: "0.0.1" },
        });
        notify("initialized", {});
      }, SLOW_MS);
      break;
    }
    case "shutdown":
      reply(id, null);
      break;
    default:
      reply(id, null);
      break;
  }
}

let buffer = Buffer.alloc(0);
process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  for (;;) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) break;
    const header = buffer.subarray(0, headerEnd).toString("utf-8");
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      buffer = buffer.subarray(headerEnd + 4);
      continue;
    }
    const contentLength = Number(match[1]);
    const bodyStart = headerEnd + 4;
    if (buffer.length < bodyStart + contentLength) break;
    const body = buffer.subarray(bodyStart, bodyStart + contentLength).toString("utf-8");
    buffer = buffer.subarray(bodyStart + contentLength);
    try {
      handleMessage(JSON.parse(body));
    } catch {
      // ignore
    }
  }
});
process.stdin.resume();
process.stderr.resume();
setInterval(() => {}, 1000);
