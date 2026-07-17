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

## Admin panel port (phase 2, in progress)

- **The new admin lives at `/admin` inside client-v2** (same SPA, same build). The server's
  old `/admin -> /old-site/admin` redirect was removed; the old Angular admin stays reachable
  directly at `/old-site/admin`. (2026-07-17)
- **No AI Assistant (copilot chat) in the new admin**, consistent with the no-AI-chat-bot rule.
  (2026-07-17)
- **No vite proxy, ever.** The user explicitly rejected proxying dev traffic through vite.
  Dev talks directly to the real server URL. (2026-07-17)
- **Admin routes DO send CORS headers now** (reversed later on 2026-07-17, after the user
  understood CORS grants browser permission rather than restricting the server): headers are
  emitted centrally in `requireLocalhost`, and the non-IP-gated admin routes are wrapped in
  `corsMiddleware`. The dev UI can call the admin API cross-origin once the prod server is
  redeployed. (2026-07-17)
- Stripe/billing is excluded from the admin port (Options Stripe panel, user-group billing
  fields, Stripe Sync tool), per the existing no-Stripe rule.

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

## CORS

- `main.go` has a `corsMiddleware` (wildcard origin) originally added for the Central Management
  frontend; user-facing API routes are opted in one by one at registration. When adding a client
  call to a route, check it is wrapped, and check the method is in Access-Control-Allow-Methods
  (PUT was missing until 2026-07-17).
- History gotcha: the first attempt at wrapping `/api/alerts/preferences` and
  `/api/keyword-lists` was partially lost when commit `076b994` was made (it kept the PUT
  method but dropped the wraps). Re-fixed in `d6bd9e9` (2026-07-17). Symptom when a route is
  unwrapped: cross-origin OPTIONS preflight returns 405 and the browser reports "CORS request
  did not succeed", while the same-origin prod app works fine.
- The dev workflow "vite dev UI against the prod server" depends on these headers, and only
  works once the prod server is redeployed with the fix.

## Admin API (server/admin.go)

- **Auth:** `POST /api/admin/login` with `{password}` returns `{token, passwordNeedChange}`
  (passwordNeedChange is hardcoded true there; trust the config document's value instead).
  Failures are plain 401 with no body (including brute-force lockout: max 3 tries per 10 min,
  in-memory). `POST /api/admin/sso` with `{pin}` (the raw stored user PIN) returns `{token}`
  for system-admin users. `GET /api/admin/login-config` is public:
  `{adminPasswordLoginDisabled, version}`.
- The token is a JWT sent as the **raw `Authorization` header (no Bearer prefix)**. The server
  keeps at most **5 tokens in memory**; they all die on server restart.
- Most admin routes are IP-gated (`requireLocalhost`: localhost, else `adminAllowedIPs`, else
  `adminLocalhostOnly`). Since 2026-07-17 `requireLocalhost` also emits CORS headers (with
  PATCH and X-Full-Import) and answers OPTIONS preflights; the non-gated admin routes
  (login-config, transcript-review, users/transfer, invitations, group codes) are wrapped in
  `corsMiddleware` instead.
- `GET /api/admin/config` returns `{config: {...}, passwordNeedChange}`; the config websocket
  (`/api/admin/config` with WS upgrade, first client message = token) pushes the **bare**
  config payload with no wrapper. A close with code 1000 means the session was invalidated.
- `PATCH /api/admin/options` takes a flat partial Options object; nested objects
  (`transcriptionConfig`, `openAIIntegration`, `autoLearnToneSetConfig`) are deep-merged.
  Returns the full config document. The UI must mirror `transcriptionEnabled` into
  `transcriptionConfig.enabled`. Setting `adminPasswordLoginDisabled=true` is rejected unless
  a system admin user exists.
- Toggles in the old admin auto-save single keys; text/number fields save per panel. Favicon
  and email logo are separate multipart endpoints (`POST /api/admin/favicon`, `/email-logo`),
  not Options keys.

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

## 2026-07-17 (admin phase start): admin shell, login, and Options section

**Shipped:** on `svelte-ui` as commits `5ee14ab`, `d978165` (plus history cleanup around an
accidental commit of stale staged gitlinks).

1. **Admin core plumbing** (`core/admin-types.ts`, `core/admin-client.ts`,
   `core/admin-session.svelte.ts`): typed Options model, HTTP client (login/SSO/logout,
   config GET, options PATCH, email test), config websocket with 2s reconnect, session state
   class.
2. **/admin route + shell** (`routes/admin/+page.svelte`, `features/admin/`): AdminPanel
   (lifecycle, header with live-config badge and version, section sidebar from an
   `admin-sections.ts` registry), AdminLogin (password + SSO via stored user PIN, handles
   adminPasswordLoginDisabled).
3. **Options section** (`features/admin/sections/`): spec-driven form (`options-spec.ts` +
   OptionField + OptionsSection) covering the old admin's panels (General, Branding, Alerts &
   Health, Audio, Email incl. test-email button, Integrations, Transcription, Registration).
   Stripe excluded. Toggles auto-save single-key PATCHes; other fields save per panel with
   dirty tracking; websocket pushes resync non-dirty fields.
4. **Server:** removed the `/admin -> /old-site/admin` redirect so the SPA serves /admin.

**Decisions:** see the new Standing Decisions block (admin at /admin, no AI assistant, no
dev-server accommodations / same-origin only). Also: the whole dev-proxy / dev-CORS detour
this session was explicitly reverted by the user; do not reintroduce it.

**Learned:** see the new "Admin API" section in the Server API Reference. Also: the shadcn
`skeleton` component directory exists but is empty (use Spinner); `go test` still fails on
the pre-existing Postgres-dependent `TestDiscoverLFDAll20FromDB` without a local DB, and the
local `thinline-radio.ini` expects a Postgres that is not running, so runtime verification of
/admin needs the user's deployment.

**Not ported yet in Options:** favicon/email-logo uploads, relay API key request/recover
dialogs, Radio Reference account edit flow, per-system tables (no-audio, retention, duplicate
detection), central-management registration subpanel.

**Next:** verify /admin against a real deployment, then continue the admin port (systems,
users/groups, logs, health, tools).

## 2026-07-17 (later still): Settings consolidated + typed settings registry

**Shipped:** on `svelte-ui`, uncommitted at session end.

1. The Alert Settings sheet (gear button) was removed from the dashboard's
   `AlertFeedCard.svelte`; its two settings (Notification Filter, Time Display) moved to the
   Settings tab.
2. **New settings registry**: `core/app-settings.svelte.ts`. Each simple setting is declared
   once (`selectSetting` / `toggleSetting` helpers wrapping runed PersistedState, with section,
   label, description, storage key, options, default). Consumers read/write
   `appSettings.<name>.current` anywhere, typed to the literal union of option values (getter
   falls back to the default on corrupted stored values). `SettingsTab.svelte` renders the
   registry generically: one card per section (icon map in SettingsTab, fallback sliders icon),
   select becomes a Select, toggle becomes a Switch. Adding a setting = one registry entry, no
   markup changes. `TlrAlertFeed` and AlertFeedCard now consume `appSettings` instead of owning
   PersistedStates; storage keys unchanged so existing prefs carry over.
3. **Server CORS fix** so the dev UI can hit a prod server: added PUT to corsMiddleware's
   allowed methods (alert preferences saves were failing preflight) and wrapped the
   `/api/keyword-lists` and `/api/keyword-lists/` routes with corsMiddleware in `main.go`.

**Decisions:** user wants all settings consolidated into the Settings tab and chose the typed
registry approach over hand-composed row components. Complex settings UIs (Alert Preferences)
stay custom cards; the registry is for simple scalar knobs. Server-synced (users.settings blob)
scalars were floated as a registry v2 but not built. Other PersistedState usages (collapsible
open states, map layers, volume, pagination toggle, show-debug) are UI layout memory, not
settings, and stay where they are.

**Learned:** nothing new about the backend; change was client-local only. The SPA runs with
`ssr = false`, so module-scope singletons like the registry are safe.

**Next:** admin panel phase (confirm with the user first); alert-sound selection still floated.

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