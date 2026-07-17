# Dashboard "Today" Stats Reset at 6pm Mountain (UTC Midnight)

## Summary

The dashboard's **"Incident summary (today)"** panel resets every day at **6:00pm
Mountain Time** (5:00pm in winter) instead of at local midnight. This is not a
scheduled deletion or a cron job that wipes data — no data is deleted. The stat
is a live `COUNT` over "calls since the start of today," and the **"start of
today" boundary is being computed in UTC**, so it rolls over at UTC midnight,
which happens to be 6:00pm US Mountain (during MDT, UTC−6) / 8:00pm US Eastern
(during EDT, UTC−4).

## Where the bug lives

`server/api.go`, in `StatsHandler` — the incident-summary query
(around line 9288):

```sql
WITH filtered_calls AS (
    SELECT c.transcript
    FROM calls c
    WHERE c.timestamp >= EXTRACT(EPOCH FROM date_trunc('day', NOW())) * 1000
      AND c.transcript != ''
      AND c."transcriptionStatus" = 'completed'
    ...
)
```

The day boundary is `date_trunc('day', NOW())`, evaluated **inside PostgreSQL**.
`date_trunc('day', ...)` truncates to the start of the day **in the PostgreSQL
session's timezone**. That session timezone is UTC (see below), so "start of
today" is UTC midnight, and the panel appears to reset at 6pm Mountain.

## Why the timezone is UTC (and why `TZ` on the app didn't fix it)

There are two separate containers, and the timezone story is different for each.

### The app container is correctly on local time

`docker/docker-compose.yml` sets `TZ` on the `thinline-radio` service, and the
runtime image installs `tzdata` (`Dockerfile`). Go's `time.Local` reads that
`TZ` at first use, so the Go process runs on `America/Denver`. You can confirm
this:

```sh
docker exec thinline-radio sh -c 'echo TZ=$TZ; date'
# TZ=America/Denver
# Fri Jul  3 12:41:11 MDT 2026
```

Because of this, the **other** "today" stat — `totalCallsToday` — is correct.
It computes midnight in Go and passes it to the query as a parameter:

```go
midnightToday := func() int64 {
    t := time.Now()
    midnight := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location())
    return midnight.UnixMilli()
}()
```

`t.Location()` is `time.Local` = Denver, so `totalCallsToday` rolls over at
Denver midnight. This is why the dashboard has been **inconsistent**: the call
count rolls at local midnight, but the incident breakdown rolls at 6pm — because
the incident breakdown computes its boundary in SQL, not in Go.

### The database container is on UTC

The `postgres` service historically set **no `TZ`**, so the database ran in UTC.
More importantly, even after adding `TZ` to the Postgres service, the SQL session
timezone can **still** be UTC, because of how PostgreSQL decides its timezone:

- PostgreSQL's effective `timezone` setting is written into `postgresql.conf`
  **at `initdb` time**, when the data directory is first created.
- The database was first initialized with no `TZ`, so `initdb` detected and
  pinned `timezone = 'UTC'` (or `'Etc/UTC'`) in `postgresql.conf`.
- That file lives inside the **persisted data volume** (`postgres_data`), and
  `initdb` only runs on an **empty** data directory. The existing volume is never
  re-initialized, so the pinned UTC value survives rebuilds and restarts.
- At runtime, the `TZ` environment variable is only consulted when the
  `timezone` GUC is *not* already set. Since `initdb` set it, `TZ` is ignored for
  the SQL session timezone.

Net effect: `TZ` on the Postgres container changes the container's OS clock and
log timestamps, but **not** what `date_trunc('day', NOW())` returns. That stays
UTC.

## The (unrelated) latent bug worth knowing about

There is a *separate* timezone footgun in `server/main.go` that does **not**
affect the compose deployment, but bites anyone running the bare binary with a
`.env` file:

```go
func main() {
    processStartTime = time.Now()
    runtime.GOMAXPROCS(runtime.NumCPU())
    log.Printf("Starting ThinLine Radio with %d CPU cores", ...) // <-- first use of time.Local
    loadDotEnv(".env", "../.env")                                // <-- sets TZ too late
```

Go initializes `time.Local` lazily, the first time any code formats a local
time. The default `log.Printf` prints a local timestamp, so **that** call latches
`time.Local` to whatever `TZ` is in the real process environment at that moment.
`loadDotEnv` runs *afterward*, so if `TZ` is supplied only via the `.env` file,
`os.Setenv("TZ", ...)` comes too late — `time.Local` is already cached (to UTC),
and stays UTC for the life of the process.

This is harmless under Docker Compose, because Compose injects `TZ` as a real
container environment variable *before* the process starts, so `time.Local` is
correct on first use. It only matters for non-compose / bare-binary deployments
that rely on the `.env` file for `TZ`. Fix: move `loadDotEnv(...)` to the very
top of `main()`, before the first `log.Printf` and before `time.Now()`.

## How to fix the actual (Postgres) bug

Pick one. All are safe and none delete data.

### Option A — compute the boundary in Go (most consistent, recommended)

Make the incident query use the same Go-computed `midnightToday` value the
`totalCallsToday` query already uses, passed as a bind parameter, instead of
`date_trunc('day', NOW())`. Every "today" stat then shares one local-midnight
boundary and is independent of the database's timezone. This is a code change in
`server/api.go`.

### Option B — force the Postgres session timezone via compose

Override the pinned GUC at server startup (works without re-initializing the
volume):

```yaml
  postgres:
    image: postgres:16-alpine
    command: ["postgres", "-c", "timezone=America/Denver"]
```

The `-c timezone=...` flag overrides whatever `postgresql.conf` contains.

### Option C — set the timezone on the database once

Persists in the database and survives restarts:

```sh
docker exec thinline-postgres psql -U thinline_user -d thinline_radio \
  -c "ALTER DATABASE thinline_radio SET timezone TO 'America/Denver';"
```

New connections after this run pick up the new timezone.

> Note: Options B and C shift **all** SQL date/time math to Denver, not just this
> one query. In this codebase there is only the single `date_trunc` doing
> calendar-day logic, so that is fine here — but it is a broader change than
> Option A, which touches only the one query.

## How to verify the fix

After applying a fix and recreating the stack, confirm the database session
timezone (for Options B/C) and watch the boundary:

```sh
docker exec thinline-postgres psql -U thinline_user -d thinline_radio -c 'SHOW timezone;'
# expect: America/Denver   (not UTC / Etc/UTC)
```

The incident summary should then reset at local midnight, matching
`totalCallsToday`.