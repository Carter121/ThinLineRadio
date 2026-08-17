// Copyright (C) 2026 Carter Carling <carter@cartercarling.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>

package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"strings"
	"sync"

	"rdio-scanner/server/internal/models"
)

//* Clustering thresholds: a call within this distance and rolling window of
//* an open incident threads into it instead of opening a new one
const (
	incidentClusterRadiusMeters = 100.0
	incidentClusterWindowMs     = int64(30 * 60 * 1000)
)

//* Serializes incident assignment across transcription workers so two related
//* calls cannot both open a new incident
var incidentAssignMutex sync.Mutex

//* incidentRow mirrors one incidents table row during assignment. The fire
//* tier is deliberately NOT stored: it is classified from IncidentType with
//* the current admin rules at read time (like unit parsing), so tier edits
//* apply immediately and retroactively.
type incidentRow struct {
	Id                uint64
	FirstSeenAt       int64
	LastSeenAt        int64
	Lat               sql.NullFloat64
	Lon               sql.NullFloat64
	NormalizedAddress string
	IncidentType      string
	CallCount         int
	TalkgroupRefs     string
}

var incidentAddrJunk = regexp.MustCompile(`[^A-Z0-9 ]`)

//* normalizeIncidentAddress canonicalizes a spoken address for equality
//* comparison: uppercase, punctuation stripped, direction words shortened,
//* whitespace collapsed
func normalizeIncidentAddress(addr string) string {
	up := incidentAddrJunk.ReplaceAllString(strings.ToUpper(addr), " ")
	fields := strings.Fields(up)
	for i, f := range fields {
		switch f {
		case "NORTH":
			fields[i] = "N"
		case "SOUTH":
			fields[i] = "S"
		case "EAST":
			fields[i] = "E"
		case "WEST":
			fields[i] = "W"
		}
	}
	return strings.Join(fields, " ")
}

func haversineMeters(lat1, lon1, lat2, lon2 float64) float64 {
	const earthRadius = 6371000.0
	rad := math.Pi / 180
	dLat := (lat2 - lat1) * rad
	dLon := (lon2 - lon1) * rad
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*rad)*math.Cos(lat2*rad)*math.Sin(dLon/2)*math.Sin(dLon/2)
	return 2 * earthRadius * math.Asin(math.Sqrt(a))
}

//* fireTierRank orders tiers for upgrades: an incident's tier only ever moves up
func fireTierRank(tier string) int {
	switch tier {
	case fireTierStructure:
		return 2
	case fireTierWildland:
		return 1
	}
	return 0
}

//* matchIncident returns the first open incident the call belongs to: within
//* the cluster radius when both sides have confident coordinates, else by
//* normalized address equality. Cross-talkgroup by construction.
func matchIncident(open []*incidentRow, hasPoint bool, lat, lon float64, addr string) *incidentRow {
	for _, inc := range open {
		if hasPoint && inc.Lat.Valid && inc.Lon.Valid &&
			haversineMeters(inc.Lat.Float64, inc.Lon.Float64, lat, lon) <= incidentClusterRadiusMeters {
			return inc
		}
		if addr != "" && inc.NormalizedAddress != "" && inc.NormalizedAddress == addr {
			return inc
		}
	}
	return nil
}

//* incidentDisplayAddress picks the address stored for UI cards: geocoded
//* rooftop address when available, else the spoken address
func incidentDisplayAddress(parsedAddr *models.ParsedAddress) string {
	if parsedAddr.Match != nil && (parsedAddr.Match.Precision == "" || parsedAddr.Match.Precision == "rooftop") {
		return parsedAddr.Match.FullAddress
	}
	if parsedAddr.OriginalAddress != "" {
		return parsedAddr.OriginalAddress
	}
	return parsedAddr.Address
}

//* assignCallToIncident threads a freshly transcribed alerting-talkgroup call
//* into an incident, creating one when nothing matches, and sends the fire
//* topic notification when the incident is a notifying fire tier. Called from
//* storeTranscription, the only place holding the parsed address in memory.
func (controller *Controller) assignCallToIncident(callId uint64, talkgroupRef uint, parsedAddr *models.ParsedAddress, transcript string) {
	if parsedAddr == nil {
		return
	}

	//* Call timestamp from the DB (not wall clock) so replays thread correctly
	var ts int64
	if err := controller.Database.Sql.QueryRow(`SELECT "timestamp" FROM "calls" WHERE "callId" = $1`, callId).Scan(&ts); err != nil {
		controller.Logs.LogEvent(LogLevelWarn, fmt.Sprintf("incident assign: read call %d timestamp failed: %v", callId, err))
		return
	}

	addr := normalizeIncidentAddress(parsedAddr.Address)
	var lat, lon float64
	hasPoint := false
	if m := parsedAddr.Match; m != nil && (m.Precision == "rooftop" || m.Precision == "nearby") {
		//* street/intersection/uncertain/Nominatim coordinates are too loose
		//* to cluster on; those calls thread by address equality only
		lat, lon = m.Lat, m.Lon
		hasPoint = true
	}
	if addr == "" && !hasPoint {
		return
	}

	tierRows := controller.Options.FireIncidentTypes
	callTier, _, _ := classifyFireTier(parsedAddr.IncidentType, tierRows)

	incidentAssignMutex.Lock()
	defer incidentAssignMutex.Unlock()

	rows, err := controller.Database.Sql.Query(`
		SELECT "incidentId", "firstSeenAt", "lastSeenAt", "lat", "lon", "normalizedAddress",
			"incidentType", "callCount", "talkgroupRefs"
		FROM "incidents" WHERE "lastSeenAt" >= $1 ORDER BY "lastSeenAt" DESC`,
		ts-incidentClusterWindowMs)
	if err != nil {
		controller.Logs.LogEvent(LogLevelWarn, fmt.Sprintf("incident assign: query open incidents failed: %v", err))
		return
	}
	var open []*incidentRow
	for rows.Next() {
		inc := &incidentRow{}
		if err := rows.Scan(&inc.Id, &inc.FirstSeenAt, &inc.LastSeenAt, &inc.Lat, &inc.Lon,
			&inc.NormalizedAddress, &inc.IncidentType, &inc.CallCount, &inc.TalkgroupRefs); err == nil {
			open = append(open, inc)
		}
	}
	rows.Close()

	best := matchIncident(open, hasPoint, lat, lon, addr)

	var incidentId uint64
	incidentType := parsedAddr.IncidentType
	isUpdate := false

	if best == nil {
		refs, _ := json.Marshal([]uint{talkgroupRef})
		var latVal, lonVal any
		if hasPoint {
			latVal, lonVal = lat, lon
		}
		if err := controller.Database.Sql.QueryRow(`
			INSERT INTO "incidents" ("firstSeenAt", "lastSeenAt", "lat", "lon", "normalizedAddress",
				"displayAddress", "incidentType", "callCount", "talkgroupRefs")
			VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8) RETURNING "incidentId"`,
			ts, ts, latVal, lonVal, addr, incidentDisplayAddress(parsedAddr),
			parsedAddr.IncidentType, string(refs)).Scan(&incidentId); err != nil {
			controller.Logs.LogEvent(LogLevelWarn, fmt.Sprintf("incident assign: insert failed: %v", err))
			return
		}
	} else {
		isUpdate = true
		incidentId = best.Id

		if ts > best.LastSeenAt {
			best.LastSeenAt = ts
		}
		if ts < best.FirstSeenAt {
			best.FirstSeenAt = ts
		}
		best.CallCount++
		if !best.Lat.Valid && hasPoint {
			best.Lat = sql.NullFloat64{Float64: lat, Valid: true}
			best.Lon = sql.NullFloat64{Float64: lon, Valid: true}
		}
		//* Fire types upgrade the incident's type, never downgrade it. Tiers
		//* are classified on the fly so admin rule edits apply immediately.
		bestTier, _, _ := classifyFireTier(best.IncidentType, tierRows)
		if fireTierRank(callTier) > fireTierRank(bestTier) {
			best.IncidentType = parsedAddr.IncidentType
		} else if best.IncidentType == "" && parsedAddr.IncidentType != "" {
			best.IncidentType = parsedAddr.IncidentType
		}

		var refs []uint
		_ = json.Unmarshal([]byte(best.TalkgroupRefs), &refs)
		found := false
		for _, r := range refs {
			if r == talkgroupRef {
				found = true
				break
			}
		}
		if !found {
			refs = append(refs, talkgroupRef)
		}
		refsJSON, _ := json.Marshal(refs)

		var latVal, lonVal any
		if best.Lat.Valid {
			latVal, lonVal = best.Lat.Float64, best.Lon.Float64
		}
		if _, err := controller.Database.Sql.Exec(`
			UPDATE "incidents" SET "firstSeenAt" = $1, "lastSeenAt" = $2, "lat" = $3, "lon" = $4,
				"incidentType" = $5, "callCount" = $6, "talkgroupRefs" = $7
			WHERE "incidentId" = $8`,
			best.FirstSeenAt, best.LastSeenAt, latVal, lonVal, best.IncidentType,
			best.CallCount, string(refsJSON), best.Id); err != nil {
			controller.Logs.LogEvent(LogLevelWarn, fmt.Sprintf("incident assign: update %d failed: %v", best.Id, err))
		}

		incidentType = best.IncidentType
	}

	if _, err := controller.Database.Sql.Exec(`
		INSERT INTO "incidentCalls" ("incidentId", "callId", "addedAt") VALUES ($1, $2, $3)
		ON CONFLICT DO NOTHING`, incidentId, callId, ts); err != nil {
		controller.Logs.LogEvent(LogLevelWarn, fmt.Sprintf("incident assign: link call %d failed: %v", callId, err))
	}

	//* The incident's tier comes from its (possibly upgraded) type under the
	//* CURRENT rules, so every call threaded into a fire incident notifies
	finalTier, priority, notify := classifyFireTier(incidentType, tierRows)

	controller.Logs.LogEvent(LogLevelInfo, fmt.Sprintf("incident %d: call %d threaded (update=%v, tier=%q)", incidentId, callId, isUpdate, finalTier))

	//* Poke clients so the feed refetches and picks up the incident link
	go controller.broadcastIncidentPoke(incidentId)

	if notify {
		go controller.sendFireNtfy(callId, priority, incidentType, parsedAddr, transcript, isUpdate)
	}
}

//* broadcastIncidentPoke nudges connected clients to refetch the alert feed.
//* Access control lives in the REST handlers; the poke carries no call data.
func (controller *Controller) broadcastIncidentPoke(incidentId uint64) {
	controller.Clients.mutex.Lock()
	var targets []*Client
	for client := range controller.Clients.Map {
		if client.User != nil {
			targets = append(targets, client)
		}
	}
	controller.Clients.mutex.Unlock()

	if len(targets) == 0 {
		return
	}

	msg := &Message{Command: MessageCommandAlert, Payload: map[string]any{
		"type":       "incident",
		"incidentId": incidentId,
	}}
	for _, client := range targets {
		select {
		case client.Send <- msg:
		default:
			//* Channel full, skip
		}
	}
}

//* cleanupOrphanIncidents removes incidents whose calls were all pruned
func (controller *Controller) cleanupOrphanIncidents() {
	if _, err := controller.Database.Sql.Exec(`
		DELETE FROM "incidents" WHERE NOT EXISTS (
			SELECT 1 FROM "incidentCalls" ic WHERE ic."incidentId" = "incidents"."incidentId"
		)`); err != nil {
		controller.Logs.LogEvent(LogLevelWarn, fmt.Sprintf("incident cleanup failed: %v", err))
	}
}
