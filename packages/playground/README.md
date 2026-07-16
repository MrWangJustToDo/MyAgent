# @my-agent/playground

Browser playground that boots a **WebContainer** as `CoreEnv` and renders the shared `@my-agent/app` UI the same way the Chrome extension does (`AdapterProvider` + `InkTerminalBox` + `App`).

## Quick start

```bash
# from repo root (core + app must be built)
pnpm build:core && pnpm build:app
pnpm install
pnpm dev:playground
```

Open http://localhost:5177 — set model / base URL / API key in **Settings**, then chat. The agent workspace is an in-browser Linux-like env (same FS for tools and shell).

## Architecture

```
Browser
 ├─ Vite host + InkTerminalBox + @my-agent/app
 ├─ PlaygroundAgentAdapter → createAgentFromConfig()
 └─ createWebContainerEnv() → registerCoreEnv()
      └─ WebContainer (fs + jsh spawn + fetch)
```

Unlike the extension, there is **no** remote `@my-agent/server` — CoreEnv is local to the tab.

## Deploying to GitHub Pages

| Concern | Impact |
|--------|--------|
| **COOP / COEP headers** | GitHub Pages **cannot** set `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy`. WebContainers need `SharedArrayBuffer` → cross-origin isolation. |
| **Workaround** | This package ships `public/coi-serviceworker.js`. On first visit the SW registers and **reloads** the page to inject COOP/COEP. Fragile with some third-party assets (needs CORP / credentialless). |
| **StackBlitz network** | WebContainers still talk to StackBlitz for runtime/npm acceleration. Not a fully offline static app; subject to their availability and ToS. |
| **HTTPS / secure context** | Required for the COI service worker and WebContainers. `*.github.io` is fine; `file://` is not. |
| **API keys** | Keys live in `localStorage` and LLM requests leave the browser toward your provider. Do not treat a public Pages deploy as a multi-tenant product without a proxy. |
| **Web tools (`webfetch` / `websearch`)** | Playground routes `CoreEnv.fetch` through WebContainer Node (not browser fetch) so GitHub Pages is not blocked by CORS. |
| **MCP stdio** | Not available in the browser CoreEnv (same limitation as the extension without a server). |
| **Base path** | Vite `base: "./"` supports project-site paths (`username.github.io/repo/`). |

**Recommendation:** use `pnpm preview` or a host that can set COOP/COEP natively (Cloudflare Pages `_headers`, Netlify, self-hosted nginx). Treat GitHub Pages as best-effort via the COI service worker.

### GitHub Actions deploy

Workflow: [`.github/workflows/playground-pages.yml`](../../.github/workflows/playground-pages.yml)

1. In the repo on GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Push to `main` / `master` (or run **Actions → Deploy Playground to GitHub Pages → Run workflow**).
3. After the workflow finishes, open the deployment URL (project site: `https://<user>.github.io/<repo>/`).

The workflow runs `pnpm build:core && pnpm build:app && pnpm build:playground` and publishes `packages/playground/dist`. `coi-serviceworker.js` is copied to the site root next to `index.html`.

## Validate path helper

```bash
pnpm --filter @my-agent/playground validate:workspace-path
```
