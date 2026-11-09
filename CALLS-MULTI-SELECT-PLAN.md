# Calls Tab: Temporary Multi-Channel Selection

## 1. Requested feature

Allow client-v2 users to select multiple talkgroups, multiple groups, or a combination of both in the Calls tab.

This should behave like creating a temporary group in admin and adding the desired channels to it, without requiring admin access or changing shared configuration.

For example, a user following several structure fires could select channels from multiple fire departments and review their recorded calls together in chronological order.

### Expected behavior

- Combine all selected groups and individual talkgroups into one call list.
- Include each call once, even when selected groups overlap.
- Reuse existing playback, automatic progression, pagination, Load all, Search, and Refresh.
- Keep manual Refresh behavior. Automatically following incoming calls is outside this feature.
- Keep selections when refreshing the results.
- Allow individual channel selections across systems without requiring a System selection first.
- Limit changes to client-v2 and the supporting server functionality. Do not modify the old frontend.
- This is a personal app. Existing single-selection URLs do not need migration or compatibility support in client-v2.

### Finding channels easily

Users must be able to find a channel through its group.

For example, expanding **XYZ FD** should reveal its channels, allowing the user to select **Channel 11** without scrolling through hundreds of unrelated talkgroups.

Expanding a group and selecting the entire group must be separate actions.

## 2. Server plan

### Approach

Add an optional resolved channel list to the existing websocket `LCL` call-search request.

Client-v2 already receives group membership. It can expand selected groups, combine them with individually selected talkgroups, and send the resulting deduplicated channel list.

The server does not need to distinguish between channels selected individually and channels included through a group.

Example request addition:

```json
{
  "channels": [
    { "system": 1, "talkgroup": 101 },
    { "system": 1, "talkgroup": 102 },
    { "system": 2, "talkgroup": 201 }
  ]
}
```

These numbers are system and talkgroup references, matching the existing Calls protocol, rather than database row IDs.

### Required changes

- Extend `CallsSearchOptions` and its request parser to accept a typed channel list, with an explicit distinction between absent and present fields.
- Group channel references by system and construct the same style of database condition used by the existing group filter. Use validated numeric values or bound parameters, never raw request strings in SQL.
- Apply this condition before sorting and pagination.
- For requests using `channels`, use it instead of the legacy group/talkgroup selection conditions. Continue applying date and system constraints.
- Retain existing access checks, delay handling, response format, and legacy request behavior.
- Validate positive integer references within supported numeric bounds and deduplicate by `(system, talkgroup)`. Reject `null`, wrong types, incomplete objects, fractional numbers, and out-of-range values. Set and document a generous maximum request list size suitable for the configured systems.
- Reject an entire malformed request rather than partially accepting it or silently dropping the filter.
- An omitted `channels` field retains existing behavior. An explicitly empty list matches no calls, even when legacy selection fields are also supplied. Do not use list length alone to decide whether the filter exists.
- Provide an identifiable LCL validation error response and handle it in client-v2, clearing loading states and showing a useful error. The current parser cannot return an error, and socket processing errors are only logged, so rejection requires changes beyond the query builder.
- Sort by timestamp and then call ID, with both following the requested sort direction, to make equal-timestamp ordering deterministic.

The main implementation points are in `server/call.go`, the LCL handler in `server/controller.go`, and the client websocket types/error handling. Keep existing old-frontend requests working; dropping client-v2 legacy URL support does not remove server protocol compatibility. No database schema change or new endpoint is required.

### Pagination limits

Keep existing offset pagination for the initial feature. A frozen filter snapshot and deterministic ordering prevent filter mixing and unstable ties, but do not freeze database contents. Incoming calls, delayed calls becoming available, or deletions can shift offsets even without automatic refresh. Deduplication cannot recover skipped records.

Treat cursor pagination using `(timestamp, callId)` as a separate improvement, not a prerequisite for multi-selection. Do not promise snapshot-consistent pagination in this version.

### Effort and verification

The original 1–2 hour server implementation estimate excluded error propagation and pagination ordering changes. Estimate implementation and focused testing together after checking the existing test setup; avoid treating the query filter alone as the whole server task.

Test mixed systems, duplicate selections, absent/empty/null/malformed input, list-size limits, permissions, delays, equal timestamps, pagination, and compatibility with existing group searches. Check query performance with a large channel selection against representative data and existing indexes. Run Go build and tests separately.

### Required automated Go tests

Write the tests alongside the server implementation. Use table-driven tests and assert observable results rather than only comparing generated SQL strings. Suggested files are `server/call_search_options_test.go`, `server/call_search_test.go`, and `server/controller_call_search_test.go`.

#### Request parsing and validation

Exercise requests decoded through the same JSON path used by websocket messages, including the numeric representation passed to `fromMap`.

- Omitted `channels` preserves the existing filters; `channels: []` is explicitly present and matches no calls.
- Valid single-system and mixed-system lists preserve the correct reference pairs. Repeated identical pairs are deduplicated, while the same talkgroup reference in two different systems remains two channels.
- Reject a null channel list, non-array values, null/non-object entries, missing fields, string or boolean references, zero, negative numbers, fractions, and numbers exceeding supported bounds.
- Test the configured maximum list size and one entry beyond it. Enforce the raw input limit before deduplication so repeated entries cannot bypass it.
- Reject the entire request when a malformed entry follows valid entries. No partially parsed or unrestricted search may run.
- When `channels` is present, legacy group/talkgroup fields cannot narrow or replace it. System and date constraints still apply.

#### Search results with an isolated database

Follow the isolated PostgreSQL schema pattern in `server/incidents_manual_test.go`, using a dedicated `TLR_CALL_SEARCH_TEST_DSN`. Create a fresh schema per test fixture, clean it up with `t.Cleanup`, and never read or mutate the application's configured database. Skip integration tests with a clear reason when the explicit test DSN is absent; a configured but unreachable test database must fail.

Seed a small deterministic fixture with two systems, at least two talkgroups per system, overlapping group definitions, matching talkgroup references across systems, different database IDs and references, equal-timestamp calls, calls before and after a date boundary, and restricted/delayed calls. Include the tables and columns used by the actual search query, including delayed-call and source-unit lookups. Use timestamps comfortably away from delay boundaries to avoid sleeps and timing-sensitive assertions.

- A mixed channel list returns exactly the selected pairs, with no accidental cross-product between systems and talkgroups.
- Duplicate input and overlapping group membership produce each call once. Resolving an equivalent temporary group yields the same call IDs as the channel-list search.
- An empty list and a list containing only nonexistent pairs return no calls. Neither falls back to all calls.
- A System constraint intersects the channel list. An entirely out-of-scope list returns no calls.
- Date filtering retains the existing lower-bound behavior, including calls exactly on the boundary.
- Ascending and descending results follow `(timestamp, callId)` in the requested direction, including ties.
- For an unchanged fixture, fetching successive small pages produces the same exact ordered IDs as a single larger search, without gaps or duplicates. Assert offsets, page limits, and `hasMore` for fewer than, exactly, and more than one page of matching calls, including a final empty page.
- Unauthorized channels never appear. Test mixed authorized/unauthorized selections, no authorized matches, and restricted searches with no authenticated user.
- Global queued delays and per-user/system/talkgroup delay rules remain enforced. Include released calls and calls still delayed, with different delays across selected channels.
- In the access-filtered path, interleave restricted and delayed rows with playable rows. Pagination and `hasMore` must describe playable results rather than stopping at filtered rows.
- Requests omitting `channels` retain existing group, system, talkgroup, date, and sort behavior. Compare exact result IDs, including the existing group/talkgroup intersection.

These pagination assertions use unchanged data. Do not assert snapshot consistency during concurrent inserts, deletions, or delayed-call release while offset pagination remains in use.

#### LCL handler and error responses

- A valid request emits an LCL success response with the existing result shape and correctly filtered results.
- A malformed channel list emits an identifiable LCL validation error rather than only logging it. Assert that no success response or database search occurs for that request.
- An invalid request followed by a valid request on the same client can succeed, without stale parser state or a disconnected client.
- Database/search failures reach the client as identifiable LCL errors so loading can terminate. Do not expose SQL text or internal database details in the error payload.

Use a buffered client send channel for handler-level response assertions; a real websocket server is unnecessary unless testing message serialization. Keep parser tests independent of PostgreSQL.

#### Execution

Run `go build ./...` and `go test ./...` separately from `server/`. Run the integration cases with `TLR_CALL_SEARCH_TEST_DSN` explicitly set to the local test database. Report skipped database tests separately from passing tests; skipped cases do not count as verified integration behavior. Document any unrelated existing failures.

## 3. Client plan

### Compact, group-based picker

Replace the separate Group and Talkgroup dropdowns with one compact selection control. Keep System, date, Search, and Refresh readily accessible.

The picker will provide:

- Expandable groups with individual talkgroup checkboxes.
- Under All Systems, system subheadings within expanded groups and the Ungrouped section so identically named channels remain distinguishable.
- A separate checkbox for selecting an entire group.
- Search across group names and channel labels while retaining group context.
- Existing favorites and an Ungrouped section.
- Clear, Cancel, and Apply actions.
- A compact toolbar summary, such as a single selected name or “2 groups + 3 talkgroups.”

Selecting groups and individual channels adds them together. A channel appearing in multiple places must show consistent selection state, keyed by `(system, talkgroup)` rather than its label or talkgroup number alone.

Keep explicit channel choices separate from membership inherited through selected groups. Inherited channels appear checked, explain which selected groups include them, and cannot be unchecked to create exclusions. If a channel was also explicitly selected, preserve that choice when a covering group is deselected. Deselecting one group must not remove channels still included through another group.

A group checkbox represents explicit whole-group selection, not merely whether every visible child happens to be checked. Selecting a group while searching selects its full membership within the System scope, including children hidden by the picker search. Excluding individual channels from a selected group is outside this version.

Apply commits the selection and searches. Cancel or closing the picker discards uncommitted changes.

### State and requests

- Store selected group names and individual channel references in Calls state.
- Use a small pure resolver to calculate their union from the current configuration when searching or refreshing. Keep permission and delay enforcement on the server independent of this resolver.
- Send one deduplicated `channels` list through the extended `LclFilters` interface.
- Preserve committed selections in a new URL representation, using group names and explicit channel pairs rather than expanded group membership. Do not parse or migrate the old single-selection group/talkgroup parameters. Keep system/date/sort parameters where useful.
- Separate picker draft state, committed selection state, and the immutable search snapshot associated with displayed results. The snapshot includes resolved channels, System, date, and sort direction. Every subsequent page uses that same snapshot, including during Load all.
- Keep at most one LCL request outstanding. If a new search supersedes it, discard its result and issue the latest requested search after it finishes. Apply the same rule to errors so an older request cannot replace newer results or alter their loading state. This avoids requiring request IDs for the initial feature.
- Clear affects only the picker draft until Apply. Applying no group or channel selections restores all channels within the System filter by omitting `channels`.
- A nonempty selection resolving to no channels sends `channels: []`. This includes groups with no members in the current System scope. Never broaden such a search to all channels.
- Keep unavailable group/channel selections visible with an explanation if configuration or access changes. If none resolve, show an empty result; if some resolve, show those results with the unavailable-selection notice. Wait for initial configuration before resolving restored selections. Refresh resolves membership again; pagination retains the original resolved snapshot.

### System scope

Allow individual talkgroup selections with All Systems selected. Channel pairs already contain their system reference, so this requires picker organization and selection-state changes rather than a new server design.

Treat System as a scope filter over both selected groups and explicit channels. Changing System preserves selections, but only channels within that scope contribute to results. Clearly indicate selections outside the current scope, and restore their effect when returning to All Systems. If all selections are outside the scope, return no calls rather than omitting `channels`.

Use simple system subheadings and labels with the existing components. A new tree framework, saved presets, and a broader picker redesign are not required for cross-system selection.

### Mobile layout

Use a nearly full-screen dialog on mobile and a bounded dialog on desktop. Keep search and action controls fixed while the group list scrolls.

Use comfortable touch targets and keep long selection lists inside the picker so the Calls toolbar remains compact.

Reuse existing shadcn-svelte components without hand-editing generated components.

### Verification

- Select Channel 11 by expanding XYZ FD.
- Compare combined results with an equivalent temporary admin group.
- Verify overlapping groups, inherited versus explicit checkbox state, selecting whole groups while searching, favorites, and ungrouped channels.
- Select individual channels from multiple systems under All Systems, including matching talkgroup numbers and labels. Verify narrowing System, out-of-scope selection indicators, and restoring All Systems.
- Verify new URL restoration, unavailable selections, empty resolution, Clear/Cancel/Apply, and configuration changes during pagination.
- Verify pagination, Load all, playback, and Refresh with frozen filters, superseded requests, validation errors, and equal timestamps. Document the retained offset-pagination limitations.
- Check narrow mobile screens, long labels, large groups, keyboard navigation, and both themes.
- Run `pnpm check` and the client production build.
- Update `CLIENT-V2-PARITY-NOTES.md` after implementation.

Saved presets and scan-list integration are outside the initial version.


## Implementation status (2026-11-08)

- Server support committed in `13de0671`: channel validation and filtering, LCL errors,
  deterministic ordering, and isolated PostgreSQL regression tests.
- Client implementation includes the grouped picker, explicit/inherited choices, cross-system
  scope, new selection URLs, frozen filters, and shared websocket request coordination.
- Automated validation: Go build; call-search PostgreSQL tests with race detection;
  Go suite with the known personal-database test excluded; 11 client resolver/queue/socket tests
  (`pnpm test:calls`); client typecheck, targeted lint, and production build.
- The full Go run still fails on the unrelated `TestDiscoverLFDAll20FromDB` personal database.
  Other explicitly gated database suites skip without their own DSNs.
- Browser verification remains pending: picker interactions, keyboard navigation, long labels,
  narrow screens, both themes, and playback/Refresh/Load all with the rendered UI.
- Maximum-size search was exercised against 100,000 synthetic history rows with existing
  indexes (about 83 ms locally under the race detector). Production-scale performance is unverified.

### Follow-up: selection URL schema fix (2026-11-08)

- Fixed the shared cause of missing LCL channels and an unchanged picker trigger: Runed decoded
  JSON selections into objects, then the string schema coerced them to `[object Object]`. The
  parser fell back to no selection. Selection now uses an object schema and normalized assignments.
- Added regression coverage through actual Runed parameter assignment and URL restoration, checking
  resolved channels and summary labels for groups, explicit channels, mixed choices, unavailable
  groups, and Clear. All 12 Calls tests, typecheck, targeted ESLint, and production build pass.
- Rendered-browser verification listed above remains pending; automated checks do not replace it.
