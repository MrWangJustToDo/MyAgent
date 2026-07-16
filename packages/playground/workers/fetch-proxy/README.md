# Fetch proxy for GitHub Pages playground

Deploy this Cloudflare Worker **once**. It stays online until you delete it — you do not need to redeploy on every playground build.

Then either:

- Paste the Worker URL into playground **Settings → Fetch proxy URL**, or
- Bake it into the static app with `VITE_FETCH_PROXY_URL` (recommended for GitHub Pages).

```bash
cd packages/playground/workers/fetch-proxy
npx wrangler deploy
```

Example bake:

```bash
VITE_FETCH_PROXY_URL=https://my-agent-fetch-proxy.<account>.workers.dev pnpm build:playground
```

Or set GitHub Actions variable `VITE_FETCH_PROXY_URL` — the Pages workflow passes it into the Vite build.

Why: WebContainer outbound HTTP still goes through the browser network stack
(`*.w-corp-staticblitz.com`) and is blocked by CORS. A Worker fetch is
server-side and is not subject to browser CORS.
