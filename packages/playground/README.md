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

On boot the WebContainer mounts a starter tree (`package.json`, `README.md`, **`AGENTS.md`**). `AGENTS.md` is loaded as project instructions so the agent knows this is an in-browser WebContainer (CORS limits, no MCP stdio, ephemeral FS, prefer `webfetch` over in-container `curl`).

File tools and `run_command` share the WebContainer **project workdir** (tools see it as `/`). Spawn `cwd` is mapped relative to that workdir — do not pass Linux `/` into `jsh` or the shell starts beside the project under `/home`.

### Preview panel

When a process inside the WebContainer **listens on a TCP port**, the host UI opens a **Preview** side panel (iframe) using the URL from WebContainer `port` / `server-ready` events. Multiple ports appear as tabs; collapse/reopen with the **Preview** toggle. Refresh / Open / Copy act on the active preview URL.

Long-running `npm run dev` may keep the agent’s `run_command` tool busy until abort — preview still works while the server is up.

### Export workspace

**Settings → Export workspace…** opens a file picker over the WebContainer tree. Choose paths (checking a directory selects its children), then **Download ZIP**. Default selection skips `node_modules` and `.git`.

**Colors in Firefox:** chalk’s browser color detection only enables Chromium. The playground sets `chalk.level = 3` on startup (`force-chalk-color.ts`) so xterm receives ANSI in all browsers.

## Deploying to GitHub Pages

| Concern | Impact |
|--------|--------|
| **COOP / COEP headers** | GitHub Pages **cannot** set `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy`. WebContainers need `SharedArrayBuffer` → cross-origin isolation. |
| **Workaround** | This package ships `public/coi-serviceworker.js`. On first visit the SW registers and **reloads** the page to inject COOP/COEP. Fragile with some third-party assets (needs CORP / credentialless). |
| **StackBlitz network** | WebContainers still talk to StackBlitz for runtime/npm acceleration. Not a fully offline static app; subject to their availability and ToS. |
| **HTTPS / secure context** | Required for the COI service worker and WebContainers. `*.github.io` is fine; `file://` is not. |
| **API keys** | Keys live in `localStorage` and LLM requests leave the browser toward your provider. Do not treat a public Pages deploy as a multi-tenant product without a proxy. |
| **Web tools (`webfetch` / `websearch`)** | WebContainer outbound still hits browser CORS (`*.w-corp-staticblitz.com`). Playground uses a **server-side proxy**: Vite `/__fetch_proxy` locally, or a Cloudflare Worker on GitHub Pages. |
| **MCP stdio** | Not available in the browser CoreEnv (same limitation as the extension without a server). |
| **Base path** | Vite `base: "./"` supports project-site paths (`username.github.io/repo/`). |

**Recommendation:** use `pnpm preview` or a host that can set COOP/COEP natively (Cloudflare Pages `_headers`, Netlify, self-hosted nginx). Treat GitHub Pages as best-effort via the COI service worker.

### Fetch proxy (required for web tools)

WebContainer cannot bypass CORS. Do **not** try Node `fetch` / `curl` inside the container — they still go through the browser.

| Environment | Proxy |
|-------------|--------|
| `pnpm dev:playground` / `vite preview` | Built-in Vite middleware at `/__fetch_proxy` (automatic) |
| GitHub Pages | Deploy [`workers/fetch-proxy`](./workers/fetch-proxy) Cloudflare Worker, then set **Settings → Fetch proxy URL** (or `VITE_FETCH_PROXY_URL` at build time) |

```bash
cd packages/playground/workers/fetch-proxy
npx wrangler deploy
# paste the worker URL into playground Settings → Fetch proxy URL
```

The Worker returns `Access-Control-Allow-Origin: *` and `Cross-Origin-Resource-Policy: cross-origin` so it works under COEP.

### Bake proxy URL into the static build

Yes — set `VITE_FETCH_PROXY_URL` at **build** time (Vite inlines it). Users do not need to open Settings.

```bash
# local production build
VITE_FETCH_PROXY_URL=https://my-agent-fetch-proxy.<you>.workers.dev pnpm build:playground
```

GitHub Pages workflow reads **Repository** Variable **or** Secret `VITE_FETCH_PROXY_URL`:

1. Deploy the Worker once (`wrangler deploy`) — it stays online until you delete it.
2. Repo → **Settings → Secrets and variables → Actions**
   - Prefer **Variables** → New repository variable → name `VITE_FETCH_PROXY_URL`
   - Or **Secrets** with the same name (also supported)
   - Do **not** put it only under Environments → `github-pages` (the build job does not use that environment)
3. Re-run **Deploy Playground to GitHub Pages** (setting the variable alone does not rebuild)
4. Hard-refresh the site (or clear site data if an old empty Settings value was saved)

Check the build log for `VITE_FETCH_PROXY_URL is set (length=…)` — if you see a warning that it is empty, the variable was not visible to the build job.

### Will the Worker keep working?

| Topic | Notes |
|-------|--------|
| Longevity | Cloudflare Workers stay deployed until you remove the Worker or account. Redeploy only when you change proxy code. |
| Free tier | Generous daily request limits for personal demos; heavy public traffic may hit quotas — watch the Cloudflare dashboard. |
| Abuse | Open proxy (`Access-Control-Allow-Origin: *`) can be used by anyone who knows the URL. For a public demo that is usually fine; for production, restrict origins or add a shared secret header. |
| Cost | Free tier is enough for playground use; no need to redeploy the Worker on every Pages build. |

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
