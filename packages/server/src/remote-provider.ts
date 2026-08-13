/**
 * Remote provider proxy — re-exported from `@my-agent/core`.
 *
 * The implementation lives in core so the browser playground (which must not
 * depend on `@my-agent/server`) can register a proxy-mode provider too.
 * `createProxyModelProvider` is exported from `@my-agent/core` and re-exported
 * here to keep the existing `@my-agent/server` / `@my-agent/server/client`
 * surface unchanged.
 */

export { createProxyModelProvider, REMOTE_PROVIDER_API_KEY } from "@my-agent/core";
