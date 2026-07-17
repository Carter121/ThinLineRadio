# client-v2 Transition Log

Running log of the effort to bring client-v2 (the SvelteKit UI) up to parity with the old
Angular client (`client/`) and eventually replace it. Each Claude Code conversation that works
on this transition should read this file first and update it before finishing.

## How to maintain this file (instructions for future conversations)

- **Read this whole file before starting transition work.** It records what is done, what the
  user has decided, and backend behaviors that are easy to get wrong.
- **Before finishing a conversation**, add a new entry at the TOP of the Session Log (newest
  first) using the template below. Keep entries short: what shipped, what was decided, what was
  learned, what is next.
- **Standing decisions go in the Standing Decisions section**, not just the session entry. If
  the user says they want or don't want something in a lasting way, add it there (and remove or
  amend it if they reverse course later, noting the change in the session entry).
- **New backend/API discoveries** go in the Server API Reference section so they are findable
  without digging through session entries.
- Keep the file in project conventions: no em/en dashes as punctuation, plain markdown.

### Session entry template

```markdown
## YYYY-MM-DD: short title

**Shipped:** what was built/changed, with key files and the branch/commits if known.
**Decisions:** things the user chose, with reasoning (include "don't want" decisions).
**Learned:** non-obvious facts discovered (backend behavior, gotchas, bugs found).
**Next:** what the user said should happen next, if anything.
```

---

# Standing Decisions

User preferences and scope rules that apply to ALL transition work until the user says
otherwise. Date each item when adding it.

## Scope: what the new UI should NOT include

- **No AI chat-bot features.** (2026-07)
- **No Stripe / billing anywhere in the client UI.** "Client side" means the new UI minus the
  admin part. (2026-07)
- **No live scanner console / channels panel.** The user owns a hardware scanner and only uses
  the web UI for secondary channels (e.g. scanner on main fireground, web on staging channel),
  so the full scanning console is not needed. (2026-07)
- **Old UI theme / classic view is dropped entirely.** (2026-07)
- **The PWA is fully removed** (routes, ui components, service worker, manifest, PWA icons). The
  server's web-push (VAPID) endpoints still exist but have no client. Superseded the earlier
  "ignore the PWA" decision. (2026-07-17)
- **No transcript review or mobile hub features** were requested. (2026-07)

## How to build

- **Don't copy old client code.** The old Angular client is slow and inefficient; use it only
  to learn behavior and API contracts, then implement cleanly in Svelte 5. (2026-07)
- **unified-app (`/home/carter/Dev/unified-app`) is the source of truth for UI code.** Never
  modify it; only copy from it. (Also in CLAUDE.md.)
- Use **runed** utilities where they fit (e.g. `PersistedState` for persisted UI state); docs
  are vendored in `docs/runed/`. (2026-07)
- Follow CLAUDE.md conventions: `//*` comments, no em/en dashes, theme tokens only, reuse
  shadcn-svelte components, Luxon for dates, pnpm, run `pnpm check` after UI changes.

## Roadmap

- **Current phase: client (user-facing) features.** Status: the initial parity feature set is
  done (see 2026-07-17 entry).
- **Next phase: admin panel in the new UI.** User: "We can work on the admin stuff after we
  finish the client stuff." Confirm with the user before starting.
- Floated but not requested: alert-sound selection in the Settings tab.

---

# Server API Reference

Non-obvious Go server (`server/api.go`, `server/main.go`) behaviors learned so far. Verify
against the code if something seems off; add new findings here.

## User settings blob

- `users.settings` DB column is an opaque JSON blob. `GET/POST /api/settings?pin=`.
- **POST replaces the entire blob**, so every save must be read-modify-write to avoid
  clobbering other keys.
- The server also pushes the blob inside the websocket `CFG` message as `userSettings`.
- **Scan lists live in this blob** (`scanLists` key), server-side, not localStorage. The old
  client's stored format uses `systemId`/`talkgroupId` **ref strings**; keep that shape for
  round-trip compatibility.

## Websocket protocol

- Commands: `PIN`, `PNS`, `CFG`, `LFM`, `CAL`, `LCL`, `ALT`, `LSC`, `VER`, `XPR`, `MAX`, `ERR`.
- `CAL` flags: `'playback'`, `'alias'`, `'d'` (download). Request a call's audio for download
  with `['CAL', callId, 'd']`; the response is a `CAL` frame with flag `'d'`.

## Alert preferences

- `GET/PUT /api/alerts/preferences`. PUT upserts only the rows sent and resolves rows by
  `systemRef`/`talkgroupRef`, so strip DB ids (`systemId`/`talkgroupId`/`userId`) before
  sending.
- Defaults: `alertEnabled=false`, `toneAlerts=true`, `keywordAlerts=true`.
- Keyword lists: `GET /api/keyword-lists`.

## Registration / verification / password reset

- `POST /api/user/register` with
  `{email, password, firstName, lastName, zipCode, accessCode?, verificationCode?}` returns
  `{message, verified, pin}`.
- `GET /api/registration-settings` returns
  `{publicRegistrationEnabled, emailVerificationRequired}`.
- Signup-verification code flow: when email verification is required and no access code is
  given, request a code first, then register with `verificationCode`.
- Verification email links hit `GET /api/user/verify?token=`, which redirects to
  `/?verify=<token>`; the SPA must POST the token back (`{token}`).
- `POST /api/user/forgot-password`, then `POST /api/user/reset-password` with
  `{email, code, newPassword}`. Resend: `POST /api/user/resend-verification` with `{email}`.
- The user's setup has a single "Public" user group with Public Registration enabled and
  Billing disabled, which is why no billing UI is needed.

---

# Session Log

Newest first.

## 2026-07-17 (later): PWA removal and lib restructure

**Shipped:** on `svelte-ui`, uncommitted at session end.

1. **PWA fully removed**: deleted `src/routes/pwa/`, `src/lib/.../ui/pwa/` (BottomNav, MoreSheet,
   PwaState, PushNotificationState), `PwaCallHistory.svelte`, `static/sw.js`,
   `static/manifest.webmanifest`, and PWA-only icons (android-chrome, apple-touch-icon, badge).
   Stripped the manifest link and apple-mobile-web-app metas from `+layout.svelte`, the dead
   `standalone` prop from AlertFeedCard, CallHistory, UnitInfoCard, ApparatusCard, AudioPlayer,
   and the serviceWorker notification fallback in the alert feed. Removed the moot
   `sw.js`/`manifest.webmanifest` no-cache case in `server/main.go`.
2. **Lib restructure**: `src/lib/apps/tlr/` is gone. Loose ts files now live in `src/lib/core/`;
   the `ui/` feature folders now live in `src/lib/features/` (LoginDialog and AudioCoordinator sit
   at `features/` root). All imports rewritten to `$lib/core/...` / `$lib/features/...`.
   CLAUDE.md directory conventions updated to match.

**Decisions:** user chose the core/ + features/ layout over keeping a single `tlr/` dir or
splitting core into domain folders. PWA removal supersedes the old "ignore the PWA" rule.

**Learned:** the server's web-push (VAPID) endpoints (`server/web_push.go`, routes in `main.go`)
are now client-less; removing them was not requested. The pre-existing Go test
`TestDiscoverLFDAll20FromDB` fails without a local Postgres on :5432 (environmental).

**Next:** admin panel phase (confirm with the user first); alert-sound selection still floated.

## 2026-07-17: Initial parity feature set

Landed on `svelte-ui` as commits `34e91a9`, `b6b0123`, `964c6bf`, `ad9365e`, `0dd83a6`.

**Shipped:**

1. **Persistent audio volume**: `AudioPlayerState.svelte.ts` volume backed by runed
   `PersistedState<number>('tlr-volume', 1)`, getter clamps to [0,1] so a corrupted stored
   value can never break audio. Also added `replaceSelection(map)` for applying scan-list
   presets.
2. **Scan lists** (server-synced): new `ScanListsState.svelte.ts` (live-audio dir) with
   `$state.raw` list, `syncFromConfig` (reads `config.userSettings.scanLists`, filters
   `isFavoritesSource`), debounced 800ms read-modify-write persist, `flush()` on unmount.
   UI is a "Scan Lists" section at the top of `ChannelSelectDialog.svelte` with
   Apply / Overwrite / inline Rename / Delete / Save current. Types `ScanList` and
   `ScanListChannel` in `types.ts`; `getSettings`/`saveSettings` in `tlr-client.ts`.
3. **Audio downloading**: `requestCallDownload(callId)` in `tlr-client.ts` emitting a new
   `call-download` socket event; `CallHistoryState.svelte.ts` reuses the prefetched playback
   cache for instant saves when possible (deliberately avoiding the old client's slow
   byte-by-byte base64 building), `saveCallAudio` does Blob + object-URL anchor click.
   Download column added to `CallHistory.svelte`.
4. **Alert preferences in a new Settings tab**: `AlertPreferencesState.svelte.ts` (SvelteMap
   keyed `systemRef:talkgroupRef`, dirty tracking, saves only dirty rows with DB ids
   stripped, auth-gated load) and `SettingsTab.svelte` (nested Collapsibles system > tag,
   switches for alertEnabled/toneAlerts, keyword-list popover, custom keywords input,
   Enable/Disable all per system, sticky save bar). Tab registered in `tabs.ts` and
   `[tab]/+page.svelte`.
5. **Registration, email verification, password reset**: new `/register` route (steps
   form > code > check-email, access-code handling per registration settings), new
   `/reset-password` route (request and reset steps, prefills from URL params), client methods
   for the full flow, and "Forgot password?" / "Create an account" links in
   `LoginDialog.svelte`.

**Decisions:** the Standing Decisions section above was established this session (feature
list, no Stripe, no scanner console, drop classic theme, ignore PWA, admin deferred, use runed
PersistedState for volume). User chose a new Settings tab as the home for alert preferences.

**Learned:**

- Scan lists are stored server-side in the `users.settings` blob (an initial analysis wrongly
  said localStorage; the user corrected it by checking the DB).
- **Bug found and fixed:** the root redirect (`/` to `/dashboard`) dropped query params, so
  `/?verify=<token>` links from verification emails silently lost the token. `+page.ts` now
  forwards `url.search`, and `[tab]/+layout.svelte` consumes `?verify=` on mount (strips it
  via `replaceState`, POSTs the token, toasts the result).
- unified-app and client-v2 were verified in sync; all diffs were intentional port adaptations
  (`/tlr/` path prefixes, `$env/static/public` replaced by `tlr-config.ts`).

**Next:** admin panel work in the new UI (confirm with the user first). One leftover stash
entry (`On client-parity: wip-volume-client-parity`, contents already committed) was left for
the user to `git stash drop`.