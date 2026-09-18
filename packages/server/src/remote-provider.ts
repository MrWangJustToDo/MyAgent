/**
 * Remote provider — re-exported from `@codent/core`.
 *
 * The implementation lives in core so the browser playground (which must not
 * depend on `@codent/server`) can register a remote-mode provider too.
 * `createRemoteProvider` is exported from `@codent/core` and re-exported
 * here to keep the existing `@codent/server` / `@codent/server/client`
 * surface consistent.
 */

export { createRemoteProvider, REMOTE_PROVIDER_API_KEY } from "@codent/core";
