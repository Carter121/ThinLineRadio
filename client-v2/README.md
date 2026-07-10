# ThinLine Radio — Svelte UI (client-v2)

SvelteKit static SPA (Svelte 5 + Tailwind v4 + shadcn-svelte), ported from the `tlr` sub-app of the unified-app project. The Go server embeds the build output (`server/webapp-v2`) and serves it at the site root; the old Angular UI remains available at `/old-site` (including the admin panel at `/old-site/admin`, with `/admin` redirecting there).

## Commands

```sh
pnpm install
pnpm build   # outputs to ../server/webapp-v2 (embedded by the Go server at compile time)
pnpm dev     # vite dev server on :4200
pnpm check   # svelte-check
```

## Configuration

All env vars are optional, `PUBLIC_`-prefixed, and baked in at build time (see `.env.example` and `src/lib/tlr-config.ts`):

- `PUBLIC_TLR_URL` — origin of the TLR backend. Leave unset for production builds (the UI is served by the Go server itself and uses same-origin `/api` + websocket). For `pnpm dev`, create a `.env` with `PUBLIC_TLR_URL="http://localhost:3000"` so the dev server talks to a locally running Go server.
- `PUBLIC_MQTT_*`, `PUBLIC_TOPIC`, `PUBLIC_UNIT_TOPIC` — MQTT-over-websocket settings for the MQTT dashboard tab (trunk-recorder-mqtt). The tab shows no data until these are set at build time.

Note: `.env` files are git-ignored and excluded from the Docker build context, so Docker images build with the same-origin defaults. Set MQTT values via a checked-in change to `.env.example` defaults in `src/lib/tlr-config.ts`, or pass them into the build another way, if you need them in the Docker image.

## Routes

- `/` → redirects to `/dashboard`; `/[tab]` for dashboard, calls, alert-log, transcripts, map, apparatus, mqtt (+ hidden debug tab)
- `/pwa` and `/pwa/[tab]` — mobile PWA (manifest scope `/pwa/`, service worker `static/sw.js` registered at `/sw.js`)
