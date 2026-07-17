# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

ThinLine Radio: a trunk-recorder companion. A **Go server** (`server/`) provides the API, websocket
feed, alert engine, and admin panel, and embeds the built web UI. The current UI is **client-v2**
(`client-v2/`), a SvelteKit static SPA (Svelte 5 + Tailwind v4 + shadcn-svelte) ported from the `tlr`
sub-app of the unified-app project. The Go server serves client-v2 at the site root and keeps the old
Angular UI (`client/`) at `/old-site` (admin at `/old-site/admin`, with `/admin` redirecting there).

## Commands

Run from the repo root:

- `npm run dev` — runs the Go server and the client-v2 vite dev server together (`:4200`).
- `npm run client:v2:build` — builds client-v2 to `server/webapp-v2` (embedded by the Go server at compile time).
- `npm run server` — runs just the Go server.

Inside `client-v2/` (uses **pnpm**):

- `pnpm dev` — vite dev server on `:4200`. Needs a `.env` with `PUBLIC_TLR_URL="http://localhost:3000"`
  (or wherever the Go server runs) so the dev UI talks to a local backend.
- `pnpm build` — outputs to `../server/webapp-v2`.
- `pnpm check` — `svelte-check` typecheck. Run this after non-trivial UI changes.

Go server: `cd server && go build ./...` and `go test ./...` (or `go vet ./...`).

## IMPORTANT: special rules

- **unified-app is the source of truth for the UI.** client-v2 is a port of the `tlr` sub-app from
  `/home/carter/Dev/unified-app`. **Never modify unified-app.** When UI code needs to come from there,
  only copy *from* unified-app into this repo, never edit the original.

- **Don't hand-edit generated shadcn-svelte components.** Files under `client-v2/src/lib/components/ui/**`
  are generated. Prefer regenerating them via the shadcn-svelte CLI over hand-editing, and don't modify
  them without asking.

- **Never hardcode colors.** Use theme tokens (`bg-background`, `text-foreground`, `text-muted-foreground`,
  `border-border`, `bg-primary`, ...) so light/dark stay consistent. Shared color/breakpoint definitions
  live in `client-v2/src/lib/styles/`.

- **Env vars are baked in at build time.** All UI config is `PUBLIC_`-prefixed and read via
  `client-v2/src/lib/tlr-config.ts`. `.env` files are git-ignored and excluded from the Docker build
  context, so Docker images build with same-origin defaults. To change what ships in Docker (e.g. MQTT
  settings), edit the checked-in defaults in `.env.example` / `tlr-config.ts` rather than relying on a
  local `.env`.

- **The Go server embeds the built UI.** A UI change is not live in the Go server until you rebuild
  client-v2 into `server/webapp-v2` and recompile the server.

## Working in this repo

After a non-trivial UI change, before considering the task done, run in `client-v2/` and fix what it surfaces:

1. `pnpm check` — svelte-check; this is the only typecheck for the UI.

For Go changes, run `go build ./...` and `go test ./...` and fix what they surface.

Don't run these commands chained with `&&`, so you don't miss errors from the first when reading the end
of the output. Queue them separately. Don't report work as complete while any are failing; if a failure
is pre-existing and unrelated, say so explicitly rather than silently leaving it.

**UI work.** This project uses Svelte 5 runes, Tailwind v4, and shadcn-svelte. Reuse the shadcn-svelte
components in `client-v2/src/lib/components/ui/**` before building new ones.

## Directory conventions (client-v2)

- `src/routes/**` — thin route shells. `/` redirects to `/dashboard`; `/[tab]` covers dashboard, calls,
  alert-log, transcripts, map, apparatus, mqtt (+ a hidden debug tab). `/pwa` and `/pwa/[tab]` are the
  mobile PWA (service worker at `static/sw.js`).
- `src/lib/apps/tlr/` — the ported tlr sub-app: client (`tlr-client.ts`), session state, MQTT client,
  alert feed, and all feature UI under `ui/`.
- `src/lib/components/ui/**` — generated shadcn-svelte components.
- `src/lib/hooks/`, `src/lib/utils/`, `src/lib/styles/` — shared hooks, helpers, and styles.

## Conventions

- **Single-line comments only**, each line prefixed with `//*` (so it's colored in the user's IDE), even
  for multi-line comments.
- **No em-dashes or en-dashes** as sentence punctuation in code comments or UI copy. Use a colon, comma,
  parentheses, or two sentences instead. En-dashes in numeric ranges (e.g. "3-5") are fine.
- Dates/times are formatted with **Luxon**.
- **pnpm** is the package manager for client-v2 (there's a `pnpm-lock.yaml`).
</content>
</invoke>
