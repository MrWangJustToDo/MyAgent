/**
 * reactivity-store wraps stored objects as Vue readonly proxies.
 * Session/Host subscribe() mutates an internal Set via `this` — that add is
 * dropped on a readonly proxy (warn only). markRaw / toRaw keep the live handle.
 *
 * Run: node packages/app/test/session-handle-raw.test.mjs
 */
import assert from "node:assert/strict";

import { createState, markRaw, toRaw } from "reactivity-store";

function makeHandle() {
  return {
    listeners: new Set(),
    subscribe(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    },
    emit() {
      for (const fn of this.listeners) fn();
    },
  };
}

function makeStore(useMarkRaw) {
  return createState(() => ({ handle: null }), {
    withActions: (s) => ({
      set: (h) => {
        s.handle = useMarkRaw && h ? markRaw(h) : h;
      },
    }),
    withDeepSelector: false,
    withStableSelector: true,
  });
}

function countEmits(subscribedHandle, raw) {
  let n = 0;
  subscribedHandle.subscribe(() => {
    n += 1;
  });
  raw.emit();
  return n;
}

{
  const store = makeStore(false);
  const raw = makeHandle();
  store.getActions().set(raw);
  const proxied = store.getReadonlyState().handle;
  assert.equal(proxied === raw, false);
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(countEmits(proxied, raw), 0);
  } finally {
    console.warn = warn;
  }
  assert.equal(countEmits(toRaw(proxied), raw), 1);
}

{
  const store = makeStore(true);
  const raw = makeHandle();
  store.getActions().set(raw);
  const fromStore = store.getReadonlyState().handle;
  assert.equal(fromStore, raw);
  assert.equal(toRaw(fromStore), raw);
  assert.equal(countEmits(fromStore, raw), 1);
}

console.log("session-handle-raw: ok");
