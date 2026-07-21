/** @ts-nocheck */
/**
 * Validates preview-port list helpers (open / ready / close + active fallback).
 * Mirrors packages/playground/src/hooks/use-preview-ports.ts pure helpers.
 *
 * Run: pnpm --filter @my-agent/playground validate:preview-ports
 */
import assert from "node:assert/strict";
/* global console: readonly */

function upsertPortOpen(ports, port, url) {
  const idx = ports.findIndex((p) => p.port === port);
  if (idx === -1) {
    return [...ports, { port, url, ready: false }].sort((a, b) => a.port - b.port);
  }
  const next = ports.slice();
  next[idx] = { ...next[idx], url, ready: next[idx].ready };
  return next;
}

function markPortReady(ports, port, url) {
  const idx = ports.findIndex((p) => p.port === port);
  if (idx === -1) {
    return [...ports, { port, url, ready: true }].sort((a, b) => a.port - b.port);
  }
  const next = ports.slice();
  next[idx] = { ...next[idx], url, ready: true };
  return next;
}

function removePort(ports, port) {
  const next = ports.filter((p) => p.port !== port);
  return { ports: next, nextActive: next[0]?.port ?? null };
}

let ports = [];
ports = upsertPortOpen(ports, 5173, "https://a.local");
ports = upsertPortOpen(ports, 3000, "https://b.local");
assert.deepEqual(
  ports.map((p) => p.port),
  [3000, 5173]
);

ports = markPortReady(ports, 5173, "https://a.local/ready");
assert.equal(ports.find((p) => p.port === 5173).ready, true);
assert.equal(ports.find((p) => p.port === 5173).url, "https://a.local/ready");

const closed = removePort(ports, 3000);
assert.deepEqual(
  closed.ports.map((p) => p.port),
  [5173]
);
assert.equal(closed.nextActive, 5173);

const empty = removePort(closed.ports, 5173);
assert.deepEqual(empty.ports, []);
assert.equal(empty.nextActive, null);

console.log("validate-preview-ports: ok");
