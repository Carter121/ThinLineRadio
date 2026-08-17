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
- **Layout does not need to mirror the old admin.** Feature/API parity matters; visual layout
  and grouping should be whatever is best for the new panel. (2026-07-17)

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

## Incidents (2026-08-17)

- `GET /api/incidents?limit=N` returns `{incidents: [...]}` newest-last-seen first; each row has
  `incidentId, firstSeenAt, lastSeenAt, lat?, lon?, address, incidentType, fireTier, callCount,
  talkgroupRefs, open` (`open` = lastSeenAt within the 30-minute window).
- `GET /api/incidents/{id}` adds `calls` (chronological member calls with annotated transcripts,
  parsedAddress, labels). 404s when all member calls fail the user's access filter.
- The alerts feed rows carry `incidentId` when the call is threaded (LEFT JOIN at read time; the
  alerts table itself has no incident column because alert creation races `storeTranscription`),
  plus `fireTier` ("structure" | "wildland") when the incident notifies. The tier is NOT stored:
  it is classified from the incident's `incidentType` at read time with the current
  `fireIncidentTypes` rules (same principle as read-time unit parsing), so admin tier edits apply
  immediately and retroactively. Fire alerts tint amber via the `--fire` theme token
  (`bg-fire/15`) in the alert log and dashboard feed; the battalion red tint wins when both
  apply. Incident assignment is NOT gated on the `alertingTalkgroup` flag (it is false in prod
  even for SLC FD1 / VECC 01; transcription is driven by keyword-alert reasons): every
  transcribed call with a parsed address threads. Alerts with no incident link (pre-threading
  history) fall back to classifying their own `parsedAddress.incidentType`, so a force backfill
  re-parse makes historical fire alerts highlight too. Parser hardening (validated against all
  5.7k prod transcripts, parse rate 89.0% -> 90.0%, incidentType coverage 5028 -> 5118): patterns
  D/E accept an optional comma after the house number ("FIRE, 1300, SOUTH I-15"); pattern B
  accepts period/no punctuation around PRIORITY; incident groups allow hyphens and apostrophes
  ("HIGH-RISE FIRE", "CHILLER'S FALL") and may be anchored after a unit number; new pattern D2
  extracts freeway incidents with no house number ("FIELD OR GRASS FIRE, I-80 ... RAMP") so fire
  notifications still fire; pattern E now sets incidentType; pattern A's incident group cannot
  cross a sentence boundary and allows an optional period before AT, fixing the old
  swallowed-transcript bug (8 -> 1 remaining, a garbled transcription). Fire tier matching is
  punctuation-insensitive (both sides normalized to alphanumerics), and SECOND through FIFTH
  ALARM are default structure-tier rows. `TestParseAddressProdShapes` locks in the real prod
  transcript shapes. Browser notification filter (Settings > Alert Feed) is now All / Only
  Selected Types / None with per-type toggles (battalion, structure fire, wildland fire); the
  old stored 'battalion-only' value migrates to 'selected' with only battalion on. The feed
  re-freshes an alert whose fireTier arrives on a later refetch (incident assignment races the
  first fetch) and tracks notified ids so nothing double-notifies.
- The `ALT` websocket command also carries `{"type":"incident","incidentId":N}` pokes; treat any
  ALT frame as "refetch the alert feed".

## Websocket protocol

- Commands: `PIN`, `PNS`, `CFG`, `LFM`, `CAL`, `LCL`, `ALT`, `LSC`, `VER`, `XPR`, `MAX`, `ERR`.
- `CAL` flags: `'playback'`, `'alias'`, `'d'` (download). Request a call's audio for download
  with `['CAL', callId, 'd']`; the response is a `CAL` frame with flag `'d'`.
- Since 2026-08-16 client-v2 no longer sends the `'d'` flag anywhere (call-history playback and
  download both use `GET /api/calls/{id}/audio`); `'playback'` is still used by the alert feed,
  alert history, and transcripts features. The websocket CAL response encodes audio as a JSON
  array of decimal byte values, roughly 3-4x the raw size; prefer the HTTP endpoint for new
  audio consumers.

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

## Single-call metadata and audio (alert page)

- `GET /api/calls/{id}/meta` (added 2026-08-09): transcript (parser-corrected, with
  `transcriptAnnotations`), `transcriptionStatus`, `alertSummary`, `parsedAddress`, system and
  talkgroup ids/labels, `timestamp` (UnixMilli), `hasAudio`. Auth is user PIN via `?pin=` or
  `Authorization: Bearer` (same as the audio endpoint). Returns 404 (never 403) for both unknown
  calls and calls on talkgroups the user cannot access, so existence is not confirmed. Admin
  tokens skip the access check. The `/api/calls/` prefix is dispatched by `CallsRouter`
  (`server/call_meta.go`); the audio contract is unchanged.
- `GET /api/calls/{id}/audio` now also enforces `userHasAccess` (it previously served any call
  to any valid PIN).
- Since 2026-08-16 the audio endpoint is also the playback and download path for the calls
  page (not just the alert page). It sends `Cache-Control: private, max-age=86400, immutable`
  (call audio never changes per id) and exposes `Content-Disposition` via CORS so the client
  can read the server-side filename for downloads.
- ntfy battalion notifications (`sendWebPushIfBattalion` in `server/web_push.go`) set a `Click`
  header and an `Actions: view, View, <url>` button pointing at `<BaseUrl>/alert/<callId>`.
  The link is only added when the admin `BaseUrl` option is set; when unset the notification
  still sends without it (the `normalizePublicBaseURL` localhost fallback must never reach
  subscribers).

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

## 2026-08-17: geocode hard county filter + fire ntfy tiers + incident threading

**Shipped:** Three features from FEATURE-PROPOSALS.md.
1. Geocode confidence: the county hint is now a HARD FILTER in every `PostgresGeocoder.Lookup`
   stage (WHERE predicate, not a score), including `resolveStreetName`, street centroid (no more
   statewide fallback when hinted), and intersections. New precision value `uncertain`: when the
   spoken address has both grid directions and every candidate disagrees on one, the best guess
   falls through all stages and only returns demoted. Nominatim results are rejected unless their
   county matches the hint. The `gridAddress` regex now keeps the first direction in
   `GeocodeQuery`. Backfill gained `?force=1` (erases stale matches; second "Force re-geocode"
   button in the admin backfill card). Client: `'uncertain'` in the precision union, hollow
   dashed map pins + legend row, "(unconfirmed location)" wording on alert cards and the alert
   page. Bench: out-of-county and direction-mismatch counters. Verified against prod data:
   out-of-county 225 -> 0, confident direction mismatches 290 -> 1 (66 now honest `uncertain`).
2. Fire ntfy notifications: `server/fire_notify.go` with `classifyFireTier` (substring match,
   first row wins) over the new array option `fireIncidentTypes` (`{pattern, tier}`, tiers
   structure/wildland/none, defaults seeded in code). Sends to env-var topic `NTFY_FIRE_TOPIC`
   at priority 5 (structure) / 4 (wildland) with the same `/alert/<id>` deep link. Battalion
   path untouched (double-send on both topics is intended). Admin UI: "Fire Notification Tiers"
   card in Options > Alerts.
3. Incident threading: new `incidents` + `incidentCalls` tables (`migrateIncidents`).
   `assignCallToIncident` runs inside `storeTranscription` for alerting talkgroups (the only
   site holding parsed incidentType/geocode in memory; the alert engine and battalion goroutines
   race with it): clusters cross-talkgroup within 100 m / 30 min on rooftop/nearby coords, falls
   back to normalized address equality; fire tier upgrades never downgrade; EVERY call threaded
   into a notifying fire incident hits the fire topic ("UPDATE:" prefix after the first). Alerts
   feed LEFT JOINs `incidentCalls` and emits `incidentId`; a `{"type":"incident"}` WS poke rides
   the ALT command so clients refetch. New `GET /api/incidents` and `GET /api/incidents/{id}`.
   Client: `core/incident-grouping.ts` groups alerts by incidentId (singletons stay as-is); the
   alert log paginates grouped `IncidentGroupCard`s (newest call + collapsible earlier calls),
   the dashboard feed shows one row per incident with an "N calls" badge and Incident link, map
   pins are one per incident keyed by group key, and `/incident/[id]` is a standalone detail
   page (header, mini map, accumulated units, chronological call timeline with per-call audio).
**Decisions:** SLC FD1 and VECC 01 must only ever match Salt Lake County (Payson-style 60-mile
misses drove this); mutual-aid dispatches now get honest misses and thread by address only.
VEHICLE/TRUCK FIRE and all gas/hazmat default to "do not notify" (battalion covers big hazmat).
Every alert of a fire incident notifies, not just the first. Fire topic is env-var
(`NTFY_FIRE_TOPIC`), matching existing ntfy config; tier rows are admin-editable.
Cross-talkgroup threading. Backfill everything with force after deploy.
**Learned:** `address_points` holds only 5 counties (Salt Lake, Utah, Davis, Summit, Tooele).
Statewide there is no `500 <dir> 700 <dir>` point in Salt Lake County, which is how a zero-score
Payson row won at rooftop. `storeTranscription` races the alert engine, so alerts cannot carry
an `incidentId` column; the feed joins at read time and self-heals via the WS poke. The
FEATURE-PROPOSALS retention item is stale: per-talkgroup retention already works (`call.go:912`).
**Next:** Deploy, set `NTFY_FIRE_TOPIC`, run "Force re-geocode" from the admin backfill card,
and watch the first real fire dispatch thread + notify.

## 2026-08-17: county priority for geocoding (talkgroup-based)

**Shipped:** New admin option `addressCountyHints` (array of `{systemRef, talkgroupRef, county}`,
county = Utah FIPS code) plumbed through `options.go` (struct, FromMap, Read, Write; no migration,
options table is key/value). The transcription queue resolves the call's talkgroup to a hint and
stores it as `countyHint` in the parsed address JSON; the geocoder prefers that county at every
stage (score weight 10 beats all other components combined; fuzzy stages demand higher similarity
from out-of-county candidates: 0.6/0.7 vs 0.4/0.55; street-centroid tries county-restricted first).
Nominatim fallback sends the hinted county instead of hardcoded Salt Lake County. Backfill applies
hints too. Admin UI: "County Priority" card in Options > Transcription (talkgroup + county selects,
add/delete rows, saves via the normal options PATCH since arrays replace wholesale).
`geocode-bench` gained `-hints file.json` and reads optional systemRef/talkgroupRef CSV columns.
**Decisions:** Hint source is the talkgroup only (not the spoken channel in the transcript).
Prefer-but-allow: out-of-county matches still return when nothing fits in the hinted county.
(REVERSED later on 2026-08-17: the hint is now a hard filter; see the newer entry above.)
**Learned:** Admin config systems payload already exposes `systemRef` and per-talkgroup
`talkgroupRef`/`label` (server MarshalJSON), so the UI selects need no new API. `Options.ApplyPartial`
deep-merges maps (deletes impossible) but replaces arrays wholesale, so array-shaped options are
PATCH-friendly.
**Next:** Deploy, set the two real hint rows (VECC 01 and SLC FD1, both Salt Lake 49035), re-run
backfill.

## 2026-08-17: UGRC address points geocoder replaces Nominatim as primary

**Shipped:** New Postgres-backed geocoder (`server/internal/address/postgres.go`) querying a
UGRC Utah address points table (`address_points`, loaded by `scripts/import-address-points.sh`,
5 counties: Salt Lake, Utah, Davis, Summit, Tooele). Staged matching: exact rooftop, fuzzy
street name, nearest house number (±150), full-address trigram, street centroid, and
intersections ("X AND Y"). Cross streets from "ON 1700 WEST" phrasing break city ties.
Wired into `transcription_queue.go` as primary; Nominatim demoted to fallback (only used when
address_points misses). Bench tool `server/cmd/geocode-bench` replays prod transcripts:
88.2% match rate vs Nominatim's 71.5% on 5,022 real parsed addresses.
UI: `AddressMatch` gained `precision` ("rooftop" | "nearby" | "street" | "intersection",
empty for legacy Nominatim rows). New `displayAddress()`/`isExactMatch()` helpers in
`core/format.ts`. AlertCard, alert detail page, and map now show the transcript's own address
(plus "(approx. location)") when the match is not rooftop-exact; pins and maps links still use
matched coords.
Backfill: `/api/admin/backfill-addresses` (admin Options, both clients) now re-parses and
re-geocodes ALL completed-transcript calls with the UGRC geocoder (Nominatim fallback), upgrades
legacy Nominatim matches, and never erases an existing match on a miss. The client-v2 button no
longer requires a Nominatim URL to be enabled.
**Decisions:** No PostGIS (plain Postgres + pg_trgm; prod image unchanged). Address data lives
in the app database, public schema. Non-exact matches must never replace the spoken address in
the UI. Dev server must not point at the prod DB (alert engine and migrations could fire on
live data); read-only psql pulls from prod are fine.
**Learned:** UGRC data is EPSG:3857 (CSV export x/y too; needs reprojection, script handles
it). `pg_trgm` `%` operator uses the GIN index but `similarity() >= x` alone does not.
Pre-existing test `TestDiscoverLFDAll20FromDB` requires a personal debug DSN and fails
anywhere else.
**Next:** Rebuild client-v2 into `server/webapp-v2` and redeploy prod server binary so the new
geocoder and precision UI go live. Consider removing Nominatim entirely after prod bake-in.

## 2026-08-16: map page overhaul (full-bleed layout, incident list, filters, rich popups)

**Shipped:** Rewrote the map tab around a new `MapPage.svelte` orchestrator in
`client-v2/src/lib/features/map/`. Full-bleed layout: root layout skips main padding for the map
tab (`isFullBleed` in `routes/+layout.svelte`), tab layout locks to `h-dvh` flex column when
`activeTab === 'map'`, no more `calc(100dvh - 10rem)` magic number; map is edge-to-edge on
mobile, framed (`sm:rounded-lg sm:border`) on larger screens. New files: `MapPageState.svelte.ts`
(incidents derivation from feed, time-window + incident-type filters, marker/list selection sync,
composes `AlertFeedCardState` for audio), `age-bands.ts` (extracted AGE_BANDS + labels),
`MapLegend.svelte`, `MapFilters.svelte`, `MapIncidentList.svelte`, `MapIncidentRow.svelte`,
`MapPopupContent.svelte`. `IncidentMap.svelte` rewritten: diffing marker registry (markers restyle
every 15s so age colors stay honest), dark/light CARTO tiles reactive to mode-watcher, Leaflet
popup/control chrome themed via CSS vars, popups render `MapPopupContent` via Svelte `mount()`
(play button + `/alert/{callId}` Details link), persisted center/zoom (`tlr-map-view`),
fit-bounds and geolocate buttons, invisible 16px hit markers on coarse pointers, ResizeObserver
driven `invalidateSize`. Desktop: right-side incident list panel (lg+). Mobile: floating
"Incidents (N)" button opens a bottom Sheet with the same list; tapping a row closes it and flies
the map.

**Decisions:** Keep age-color marker encoding (not incident-type colors), with an on-map legend.
Desktop keeps a framed map, mobile is edge-to-edge. No new deps: shadcn Sheet instead of adding
drawer/resizable; no leaflet.markercluster (feed capped at 200, clustering would hide age colors).
Filters are session-only state; only view center/zoom persists.

**Learned:** Transcript annotations can repeat the same unit (e.g. ENGINE-125 twice), so any
keyed each over units must dedupe by `apparatus-number` (AlertCard already did; the map state now
dedupes in the incidents derivation). Reusing `AlertFeedCardState` (consumer id `alert`) per tab
is safe only because tabs are destroyed on switch; do not lift map state into a layout context.
Opening a Leaflet popup after `flyTo` must wait for `moveend` or the popup autopan fights the
animation. The `isolate` class on the map wrapper is required so Leaflet pane z-indexes (400-1000)
stay under the Sheet and nav.

## 2026-08-16: calls page audio loading optimized for slow links

**Shipped:** removed the 60-call eager audio prefetch window from
`CallHistoryState.svelte.ts` (it downloaded audio for a 3-page window on every search and page
change). Playback and download now use `GET /api/calls/{id}/audio` (raw binary) instead of the
websocket CAL path with its JSON byte-array encoding. Added lookahead-while-playing (the next 2
calls in auto-advance order are prefetched once a call starts playing) and a bounded LRU cache
of 40 audio Blobs replacing the unbounded `SocketCall` cache. New `getCallAudioDownload` in
`tlr-client.ts` (parses Content-Disposition for the filename); `requestCallDownload` and the
`call-download` socket event removed. Server: audio endpoint caching headers (see Server API
Reference). Also fixed a bug where auto-play died if the user hit Refresh during playback and
the clip ended before the new list arrived (deferred advance via `pendingAdvanceFromId`,
resumed when the fresh `call-list` lands).
**Decisions:** lazy audio loading with a 2-call lookahead over eager prefetch; HTTP transport
over websocket for calls-page audio; browser caching of call audio allowed (private, 1 day);
scope limited to the calls page.
**Learned:** the websocket CAL frame serializes audio as `{data: [byte, byte, ...]}` (decimal
JSON, ~3-4x raw size). Accepted minor regression: `sourceAliases` unit tags are no longer
harvested from playback responses, only from live `call` events; `directory.unitLabel` remains
the primary source.
**Next:** alert feed, alert history, and transcripts playback still use the websocket
`'playback'` path and could move to the HTTP endpoint later for the same 3-4x saving per play.

## 2026-08-09: single-alert page deep-linked from ntfy notifications

**Shipped:** new standalone route `client-v2/src/routes/alert/[callId]/+page.svelte` (mobile-first
alert detail page: transcript with unit/channel badges, `AlertMiniMap` preview when geocoded,
HTTP audio player, LoginDialog when unauthenticated); `CallMeta` type in `core/types.ts`;
`getCallMeta` and `getCallAudioBlob` in `core/tlr-client.ts`. Server: `server/call_meta.go`
(`CallsRouter` + `CallMetaHandler`, `GET /api/calls/{id}/meta`), `userHasAccess` check added to
the audio endpoint, ntfy `Click`/`Actions` deep link on battalion notifications (see Server API
Reference).
**Decisions:** battalion ntfy notifications only (alert engine stays un-wired from ntfy); page
requires login, no signed tokens in links; ntfy gets both the Click header and a "View" action
button (label is "View", not "View alert"); the page fetches audio over HTTP into a Blob
instead of using the websocket playback path (no AudioCoordinator or socket needed on a
standalone page).
**Learned:** the Go server already has a `CallMeta` type (`call.go`), so the meta handler builds
a `map[string]any`; `GetCall` returns an error (not nil) for unknown ids; the audio Blob is
prefetched at page load so the play tap can call `play()` synchronously (iOS autoplay policy);
`server/webapp` and `server/webapp-v2` need at least a `.gitkeep` to satisfy the go:embed
directives on a clean checkout.
**Next:** nothing specified.

## 2026-08-09: screen wake lock during call playback

**Shipped:** new `client-v2/src/lib/core/screen-wake-lock.ts` (`ScreenWakeLock`: request/release/
destroy, no-ops when `navigator.wakeLock` is missing, re-acquires on `visibilitychange` since the OS
drops the lock whenever the tab hides). `AudioCoordinator` now owns one instance and drives it from
`callAudio` events only: `playing` requests it (skipping the `SILENT_WAV` priming clip), and
`pause`/`ended`/`emptied` schedule a release after a 5s grace period so gaps between queued calls do
not thrash it. `AudioCoordinator.destroy()` added and called from `routes/[tab]/+layout.svelte`.

Also permanent: a small status badge fixed above the playback bar in `routes/[tab]/+layout.svelte`,
rendered and polled (500ms) only while the debug toggle in the tab bar is on. It reads
`coordinator.wakeLockDebug()`, whose `active` comes from the live `WakeLockSentinel.released`
property rather than our own intent flag, so a browser-side revoke shows up honestly. Also reports
`supported`, `requested`, `audioPaused`, `releasePending`, and the last request error.

**Decisions:** always on during playback, no settings toggle. The status badge is a keeper, not
temporary scaffolding, but stays behind the debug toggle. User reaches the app over HTTPS, so no
hidden-video fallback for insecure origins was added. `navigator.mediaSession` was left out of scope.

**Learned:** because the alert chime lives on the separate `notificationAudio` element, keying the
wake lock off `callAudio` alone automatically excludes it, which was the user's explicit requirement.

## 2026-07-17 (admin redesign): desktop-first sidebar shell, Server group completed

**Shipped:** on `svelte-ui` (commits `4bfdc0d`, `c793a7f`, plus this session's final commit).

1. **New admin shell**: full-width desktop-first layout using the shadcn-svelte `sidebar`
   component (added via CLI along with `tooltip` and `skeleton`; the generated
   `sidebar-trigger.svelte` needed a local typing fix against the project's customized Button).
   Grouped sidebar nav from `admin-sections.ts` (groups + sections registry), header with live
   badge/section title/logout, hash deep links per section (via `replaceState` from
   `$app/navigation`; raw history calls trigger a SvelteKit warning). Root `+layout.svelte`
   skips its padding for `/admin` so the shell is full-bleed.
2. **Options redesigned into per-topic pages** (General, Branding, Alerts & Health, Audio,
   Email, Integrations, Transcription, Registration): each an `OptionsSection` instance with a
   `panelId` prop; toggles in a top card (auto-save), inputs in a 2-3 column grid card, save
   button + unsaved count in the page header. System Overrides is its own page under Radio.
3. **Server-group parity gaps filled**: transcription master toggle now reads
   `transcriptionConfig.enabled` (the config document has NO flat `transcriptionEnabled` key;
   the old flat-key toggle made the whole panel hide), added hallucinationMinOccurrences,
   no-audio multiplier/time window/historical days, reconnectionEnabled gate, admin access
   controls (adminLocalhostOnly, adminAllowedIPs, adminPasswordLoginDisabled), Radio Reference
   API key, relayServerURL, Central Management fields + test-connection button
   (POST /api/admin/test-central-connection with snake_case body), relay suspension status card
   + unlock-public-listener button, and Backfill Past Addresses on the Transcription page.
4. Stub components for the remaining sections (Systems, Users, User Groups, API Keys,
   Dirwatch, Downstreams, Logs, System Health, Tools, ...) exist in `sections/` but are NOT
   registered in the nav; `AdminClient.request` is now public so future section code can live
   in per-section modules.

**Decisions:** user stopped the full-section port mid-flight due to Claude usage limits; ONLY
the Server group (plus System Overrides) is in scope for now. No whisper training/collector
fields (user does not participate in whisper model training). Transcription settings are
important (they feed dashboard alert text); they are unrelated to the excluded AI chat-bot.

**Learned:** the dev UI at :4200 points at the production server, so admin edits during dev
testing touch real config (avoid destructive testing). The admin config websocket/GET carries
full systems including talkgroups (no lazy loading needed, unlike the old admin). A complete
old-admin feature inventory (every section, endpoint, and behavior) was produced this session;
see the conversation or re-derive from client/src/app/components/rdio-scanner/admin/admin.service.ts.

**Later in the session:** the full nav was restored (unported sections show placeholder
pages pointing at /old-site/admin), and the **Transcript Parser section was fully ported**
and moved to the bottom of the Server group (`sections/TranscriptParserSection.svelte` +
`sections/transcript-parser/`): six editable lists (unit types with reject words, prefixes,
dispatch names, separators, shorthands, corrections) with inline tables, chip editors for
aliases (Enter to add), uppercase normalization on save, deep-reactivity dirty tracking, and
GET/PUT /api/admin/transcript-parser. Verified against the live server. Gotcha: mutating
state inside a function-binding getter throws state_unsafe_mutation; bind getters must be
pure and chip editors must reassign (not push into) bound arrays.

**Next:** port the remaining sections into the new shell when usage allows: Systems,
Users/User Groups (no billing), API Keys, Dirwatch, Downstreams, Logs, System Health, Tools
(password, import/export with X-Full-Import, purge, keyword lists, transcript parser),
Radio Reference import wizard.

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

**Later in the session (`fd750ec`):** restored the OpenAI chat model select and
whisper/cloudflare model datalist suggestions, added a consolidated Per-System Overrides
table (no-audio, retention, duplicate detection; POST bodies use `systemId` plus the
setting fields), and favicon / email-logo uploads (multipart fields `favicon` / `logo`,
deletes use the DELETE method, previews served at `/favicon` and `/email-logo`).

**Still not ported in Options:** relay API key request/recover dialogs (paste the key
directly for now), the central-management registration subpanel. Note the old UI's
transcription provider select has exactly 5 entries and AssemblyAI has 2; the user's
"12 items" impression came from the whisper model autocomplete suggestions.

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