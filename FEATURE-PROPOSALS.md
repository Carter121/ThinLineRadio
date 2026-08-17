# Feature Proposals

Written 2026-08-17. Handoff document for whoever builds these next.

This is a prioritized set of proposals based on an audit of the live production database
(`thinline_radio` on `carter-asus`) and the current server code. Every claim below was verified
against real prod data or the Go source at the time of writing. Where a number is quoted, the
query that produced it is described so it can be re-run.

Read `CLAUDE.md` and `CLIENT-V2-PARITY-NOTES.md` first. This file does not repeat the
conventions in those.

---

## Context: this is a single-user fork

There are 2 rows in `users` and only one real operator. There is no multi-tenant concern, no
billing, and no need to make any of this configurable for other people unless it is cheaper to
build it configurable than hardcoded. All alerting is fire department dispatch.

The two alerting talkgroups are:

| talkgroupRef | label | name |
|---|---|---|
| 559 | SLC FD1 | Salt Lake City Fire Dispatch |
| 2923 | VECC 01 | VECC Fire 01 |

Both have `addressCountyHints` set to Salt Lake County (FIPS 49035).

---

## Verified baseline (do not re-investigate)

The transcription and address pipeline is healthy. As of 2026-08-17:

- 5,729 calls have a transcript.
- 5,084 of those have a parsed address (89%).
- 4,559 are geocoded (80%), and 3,961 of those are `rooftop` precision (87%).
- `parsedAddress` is written by `transcription_queue.go:555` into both `calls` and
  `transcriptions`. It is live and load-bearing: the client-v2 map reads it via the alert feed
  (`client-v2/src/lib/features/map/MapPageState.svelte.ts`). Do not remove it.
- `incidentType` is extracted free-form from the transcript by
  `server/internal/address/parser.go` and populated on most parsed addresses. It is NOT sourced
  from any lookup table.

Alerting today is keyword-only, roughly 400 alerts/day, which is effectively one per dispatch.
`toneDetectionAlertsEnabled` is false. The only escalation is `hasBattalionUnit` in
`server/web_push.go:372`, which sends a single ntfy notification at priority 3 to one topic.

### Already cleaned up on 2026-08-17, do not resurrect

A previously merged and then reverted upstream feature (incident mapping plus call-nature
extraction) left orphaned tables and columns with zero references in the Go source. These were
dropped from prod:

- Tables: `mappingGeocodeCache`, `mappingGeocodeMissCache`, `mappingGeocodeExternalLog`,
  `mappingKnownPlaces`, `mappingKnownStreets`, `mappingStreetCorrections`, `mappingBoundaries`,
  `callNatures`, `callNaturePhraseCandidates`.
- Columns on `calls`: `parsedUnits`, `parsedChannels`, `extractedAddress`, and all 14
  `incident*` columns.
- Columns on `transcriptions`: `parsedUnits`, `parsedChannels`.
- Column `talkgroups.incidentMappingConfig`.
- Option key `mappingIntegration`.

No migration in `migrations.go` or `database.go` recreates any of these. If a proposal below
seems to want one of them back, build it fresh rather than restoring the upstream version.

`address_points` (993,856 rows, 251 MB) is the current UGRC geocoder source and is very much
alive. Keep it.

Note also that `parsedUnits` and `parsedChannels` were removed deliberately: unit and channel
parsing is now computed on the fly at read time so that changes to the parser rules in settings
take effect immediately. Do not reintroduce stored parse results.

---

## Proposal 1: fix geocode confidence before building on coordinates

**Do this first.** Proposals 2 and 3 cluster incidents by coordinate, so they will inherit and
amplify any geocoding error.

### The problem

`PostgresGeocoder.Lookup` (`server/internal/address/postgres.go:202`) treats street direction
and county hint as *scoring* signals, never as filters. `scoreExpr` at line 191 awards +2 for a
prefix direction match, +2 for suffix, +3 for city, +10 for county hint. Nothing is excluded.

When the true address point is absent from `address_points`, the best-scoring wrong row wins
and is returned at full `rooftop` precision with no indication that it is a guess.

### Evidence

Two confirmed cases, both from real dispatches:

```
spoken "1300 SOUTH 900 WEST"  ->  matched "1300 W 900 S, SALT LAKE CITY"
spoken "1700 SOUTH 700 EAST"  ->  matched "1700 S 700 W, WOODS CROSS CITY" (Davis County)
```

Direct queries against `address_points` confirm that `1300 S 900 W` and `1700 S 700 E` do not
exist in the table at all. The transposed rows were the only candidates, so they won by default.
On a grid address system a transposition is not a near miss, it is a different part of the
valley.

Scale of the problem:

- 1,723 parsed addresses are grid format (`<num> <dir> <num> <dir>`), about 34% of all parsed
  addresses.
- 290 of those (17%) resolved to a `fullAddress` whose directions do not match what was spoken.
- 229 matches overall (5%) landed outside the hinted county, and 175 of those were served at
  `rooftop` precision.

Some out-of-county matches are legitimate (VECC covers mutual aid), so 229 is an upper bound,
not a defect count. The 290 grid mismatches are the higher-confidence signal.

### Proposed approach

1. When the parsed address has both a prefix and suffix direction and a candidate disagrees on
   either, either exclude the candidate or demote the result's `precision` so it is not
   presented as rooftop. A wrong pin that looks certain is worse than an honest miss.
2. When a county hint exists and the only candidates are out of county, demote precision
   similarly rather than returning a confident cross-county match.
3. Add a new `precision` value (for example `uncertain`) rather than overloading the existing
   ones, and surface it in the map UI so a low-confidence pin renders differently.
4. Prefer falling back to street centroid within the hinted county over an exact-looking match
   in the wrong place.

### Also worth fixing while in here

`buildGeocodeQuery` (`server/internal/address/parser.go:136`) discards the first direction word,
because `gridAddress` at line 54 uses a non-capturing group:

```go
gridAddress = regexp.MustCompile(`(?i)^(\d+)\s+(?:NORTH|SOUTH|EAST|WEST|N|S|E|W)\s+(\d+.*)$`)
```

So `"2236 SOUTH 1300 EAST"` becomes the query `"2236 1300 EAST"`. This affects **only the
Nominatim fallback path**, since `Lookup` reads `parsed.Address` rather than
`parsed.GeocodeQuery`. It is therefore a lower priority than the scoring issue above, but it is
a real ambiguity being introduced for no reason.

### Acceptance criteria

- Re-running the grid-direction mismatch query over freshly geocoded calls shows a materially
  lower mismatch rate, or the remaining mismatches carry a non-rooftop precision.
- `server/cmd/geocode-bench` still passes and ideally gains a case for a transposable grid
  address whose true point is missing from `address_points`.

---

## Proposal 2: fire-type alert escalation

This is the primary requested feature.

### The problem

Every dispatch produces an alert, so alerts have stopped carrying information. The only
escalation is "a battalion chief was dispatched". In practice, especially during dry Utah
summers, units get sent to a field fire first and a chief is requested some minutes later, so
the notification arrives late or not at all.

Real fires (house, apartment, commercial, field, and similar) should notify. Small incidents
(dumpster fires, barbecue fires, alarm drops) should not. Non-battalion fire notifications
should go to a **different ntfy topic** than the existing battalion topic.

### Why this is cheap to build

Both halves already exist:

- `sendNtfyTo` (`server/ntfy.go:32`) already accepts an arbitrary topic. The current
  `sendNtfy` wrapper just hardcodes `Options.NtfyTopic`. A second topic is one new option key.
- `incidentType` extraction already produces the exact taxonomy needed, from real transcripts.

### Observed incident types in prod

Counts are all-time over 5,729 transcribed calls.

| Suggested tier | Types present in data | Approx count |
|---|---|---|
| Structure | HOUSE FIRE (43), APARTMENT FIRE (26), COMMERCIAL FIRE (22), ELECTRICAL FIRE (8), GARAGE FIRE (6), HIGHRISE FIRE (1), SHED FIRE (1) | ~107 |
| Wildland | FIELD FIRE (34), FIELD OR GRASS FIRE (9), TREE FIRE (8) | ~51 |
| Judgment call | VEHICLE FIRE (33), TRUCK FIRE (6), MISCELLANEOUS FIRE (18), FIRE INVESTIGATION (23) | ~80 |
| Do not notify | FIRE ALARM (298), ODOR INVESTIGATION (27), SMOKE INVESTIGATION (13), OUTSIDE SMOKE INVESTIGATION (11), DUMPSTER FIRE (6), BARBECUE FIRE (2) | ~357 |
| Hazmat, decide separately | NATURAL GAS LEAK (40), LARGE GAS LEAK (4), SMALL GAS LEAK (4), EXPLOSIVE MATERIAL (3) | ~51 |

`VEHICLE FIRE` is genuinely ambiguous (freeway car fire versus a car in an attached garage) and
should be a configurable tier rather than a hardcoded decision.

### Proposed approach

1. New option `fireIncidentTypes`, shaped like the existing `addressCountyHints`: an array of
   `{pattern, tier}` rows, editable in the admin UI, so tiers can be tuned without a redeploy.
   `Options.ApplyPartial` replaces arrays wholesale, which makes array-shaped options
   PATCH friendly (see `CLIENT-V2-PARITY-NOTES.md`).
2. New option `ntfyFireTopic` for the non-battalion fire channel. Fall back to no send when
   empty, matching how `NtfyTopic` behaves today.
3. Match `incidentType` with substring and fuzzy comparison, not equality. The parser emits
   variants like `HOT FIRE`, `AN EQUIPMENT FIRE`, and `ELECTRIC FIRE` that exact matching would
   miss.
4. Suggested priorities: structure at 5, wildland at 4, battalion unchanged at 3.
5. Reuse the existing deep-link behavior: `sendNtfyTo` already sets `Click` and an `Actions`
   button pointing at `<BaseUrl>/alert/<callId>`, and `BaseUrl` is set in prod to
   `https://radio.cartercarling.com`.

### Known parser bug to handle

About 7 rows have an `incidentType` that swallowed the entire transcript, for example:

```
VEHICLE FIRE, 10700, EAST I-80 WESTBOUND FREEWAY. RESPOND ON DECK, FIRE 2. BATTALION 11 AND...
```

The terminator pattern in `ParseAddress` misses when the address phrase is unusual. This is low
impact on its own but it is a second reason to use substring matching rather than equality.
Fixing the terminator in `server/internal/address/parser.go` would be a welcome side quest.

### Acceptance criteria

- A `HOUSE FIRE` dispatch with no battalion sends to the fire topic at priority 5.
- A `DUMPSTER FIRE` dispatch sends nothing.
- A battalion dispatch continues to behave exactly as it does today, on the existing topic.
- Tier assignments are editable from the admin UI without a rebuild.

---

## Proposal 3: incident threading

The highest-value structural change. Proposal 2 covers the common case; this covers the case
where dispatch never says "fire" and the incident escalates on scene.

### The problem

One incident produces many independent alerts. A stabbing on 2026-08-17 produced 5 separate
alerts in 5 minutes as Ladder 4, Medic 42, Battalion 71, and Engine 75 were each dispatched.
Nothing in the system knows they are the same event, so the alert log is repetitive and there is
no way to notice that an incident is growing.

### Proposed approach

Group calls into incidents using data that already exists: 4,559 calls carry coordinates.

- Cluster on geocoded point within roughly 100 m, within a rolling window of roughly 30 minutes,
  across both alerting talkgroups. Tune both numbers against real data.
- Fall back to normalized address string equality when one of the calls failed to geocode.
- Store incidents in a new table. Do not reuse any of the dropped upstream tables.

What this unlocks:

1. Alert Log and Map show one card per incident that accumulates units, instead of N near
   identical rows.
2. **Escalation notifications**, which is the real fix for the field-fire gap: when a battalion
   joins an incident that was already seen, send "ESCALATED: Field Fire, 2150 W 6200 S, Battalion
   11 added" rather than an unrelated new alert.
3. Unit count becomes an independent severity signal. Six units to one address is significant no
   matter what the incident type string says.

### Dependencies

Do Proposal 1 first. Clustering on coordinates will silently merge distinct incidents that
geocode to the same wrong point.

---

## Proposal 4: smaller items

Roughly descending value. None of these are blocked by the above.

### Fireground channel quick-listen

`ParsedChannel` already extracts the assigned channel from phrasing like
`RESPOND ON DECK, FIRE 2`. Surface a one-click "listen on Fire 2" control on the incident or
alert card. This matches the stated usage pattern: hardware scanner on the main fireground, web
UI on the secondary channel.

### Stats tab

There is a clean dataset of about 5.7k typed, geocoded, timestamped incidents. Worth a simple
analytics view: incident type distribution, calls by hour (alerts peak at 7 to 8 pm local),
busiest cities (Salt Lake City 1,335, West Valley 429, West Jordan 294).

### Retention

`calls` is 28 GB of a 31 GB database. 936k of 950k rows are `transcriptionStatus = 'pending'`
and will never be transcribed, because transcription only runs on the two alerting talkgroups.
The `talkgroups.retentionDays` column exists and is 0 (meaning unset) on every row, while the
global `pruneDays` is 14. Per-talkgroup retention would let the two dispatch channels be kept
much longer than everything else.

### Unit alias learning

`units` holds 2,211 rows whose labels are unusable radio IDs such as `1008021350` and
`38A-0350-M`. The `autoLearnUnitAliases` talkgroup flag and the `unitAliasLearnCandidates` table
already exist and are unused. Learning real apparatus names from transcripts would improve the
alert titles, the apparatus page, and any future unit-status board.

### Stale embedded old-site bundle

`server/webapp/816.f0c793794da0c2d3.js` still references `callNatures`, but `client/src` does
not. That bundle was built before the upstream revert, so the old Angular UI at `/old-site`
contains code calling endpoints the server no longer serves. Harmless (it will 404) but it means
`server/webapp` is out of sync with `client/`. Rebuild or accept.

---

## Open questions for the user

1. Which tier should `VEHICLE FIRE` land in? It is 33 incidents and genuinely ambiguous.
2. Should gas leaks notify at all, and on which topic? They are 51 incidents and arguably a
   different category from fire.
3. For incident threading, should incidents span the two alerting talkgroups (SLC FD1 and
   VECC 01), or stay per-talkgroup? Cross-talkgroup is more useful but riskier to get right.

---

## Build reminders

From `CLAUDE.md`, repeated because they are easy to miss:

- Run `go build ./...` and `go test ./...` for server changes. Queue them separately rather than
  chaining with `&&` so failures in the first are not missed.
- Run `pnpm check` in `client-v2/` after UI changes.
- Single-line `//*` comments only. No em dashes or en dashes as sentence punctuation.
- A UI change is not live in the Go server until client-v2 is rebuilt into `server/webapp-v2`
  and the server is recompiled.
- Update `CLIENT-V2-PARITY-NOTES.md` before finishing any client-v2 transition work.
