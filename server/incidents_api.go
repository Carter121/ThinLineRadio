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
	"net/http"
	"strconv"
	"strings"
	"time"

	"rdio-scanner/server/internal/models"
)

//* incidentToMap serializes one incidents row for the API. The fire tier is
//* classified from the incident type at read time so admin tier edits apply
//* immediately and retroactively (same principle as read-time unit parsing).
func incidentToMap(inc *incidentRow, nowMs int64, tierRows []FireIncidentType) map[string]any {
	fireTier := ""
	if tier, _, notify := classifyFireTier(inc.IncidentType, tierRows); notify {
		fireTier = tier
	}
	m := map[string]any{
		"incidentId":   inc.Id,
		"firstSeenAt":  inc.FirstSeenAt,
		"lastSeenAt":   inc.LastSeenAt,
		"address":      inc.NormalizedAddress,
		"incidentType": inc.IncidentType,
		"fireTier":     fireTier,
		"callCount":    inc.CallCount,
		"open":         nowMs-inc.LastSeenAt < incidentClusterWindowMs,
	}
	if inc.Lat.Valid {
		m["lat"] = inc.Lat.Float64
		m["lon"] = inc.Lon.Float64
	}
	var refs []uint
	if json.Unmarshal([]byte(inc.TalkgroupRefs), &refs) == nil {
		m["talkgroupRefs"] = refs
	}
	return m
}

const incidentSelectColumns = `"incidentId", "firstSeenAt", "lastSeenAt", "lat", "lon", "displayAddress", "incidentType", "callCount", "talkgroupRefs"`

func scanIncidentRow(scan func(dest ...any) error) (*incidentRow, error) {
	inc := &incidentRow{}
	//* displayAddress is scanned into NormalizedAddress: the API only ever
	//* exposes the display form
	err := scan(&inc.Id, &inc.FirstSeenAt, &inc.LastSeenAt, &inc.Lat, &inc.Lon,
		&inc.NormalizedAddress, &inc.IncidentType, &inc.CallCount, &inc.TalkgroupRefs)
	return inc, err
}

//* IncidentsHandler handles GET /api/incidents (recent list) and
//* GET /api/incidents/{id} (detail with member calls)
func (api *Api) IncidentsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		api.exitWithError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	client := api.getClient(r)
	if client == nil || client.User == nil {
		api.exitWithError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	tail := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/incidents"), "/")
	if tail != "" {
		id, err := strconv.ParseUint(tail, 10, 64)
		if err != nil {
			api.exitWithError(w, http.StatusBadRequest, "invalid incident id")
			return
		}
		api.serveIncidentDetail(w, client, id)
		return
	}

	limit := 100
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 1000 {
			limit = n
		}
	}

	rows, err := api.Controller.Database.Sql.Query(
		`SELECT `+incidentSelectColumns+` FROM "incidents" ORDER BY "lastSeenAt" DESC LIMIT $1`, limit)
	if err != nil {
		api.exitWithError(w, http.StatusInternalServerError, fmt.Sprintf("failed to query incidents: %v", err))
		return
	}
	defer rows.Close()

	nowMs := time.Now().UnixMilli()
	tierRows := api.Controller.Options.FireIncidentTypes
	incidents := []map[string]any{}
	for rows.Next() {
		inc, err := scanIncidentRow(rows.Scan)
		if err != nil {
			continue
		}
		incidents = append(incidents, incidentToMap(inc, nowMs, tierRows))
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"incidents": incidents})
}

func (api *Api) serveIncidentDetail(w http.ResponseWriter, client *Client, incidentId uint64) {
	inc, err := scanIncidentRow(api.Controller.Database.Sql.QueryRow(
		`SELECT `+incidentSelectColumns+` FROM "incidents" WHERE "incidentId" = $1`, incidentId).Scan)
	if err == sql.ErrNoRows {
		api.exitWithError(w, http.StatusNotFound, "incident not found")
		return
	}
	if err != nil {
		api.exitWithError(w, http.StatusInternalServerError, fmt.Sprintf("failed to query incident: %v", err))
		return
	}

	rows, err := api.Controller.Database.Sql.Query(`
		SELECT c."callId", c."timestamp", c."transcript", c."alertSummary", c."parsedAddress",
			c."systemId", c."talkgroupId"
		FROM "incidentCalls" ic
		JOIN "calls" c ON c."callId" = ic."callId"
		WHERE ic."incidentId" = $1
		ORDER BY c."timestamp" ASC`, incidentId)
	if err != nil {
		api.exitWithError(w, http.StatusInternalServerError, fmt.Sprintf("failed to query incident calls: %v", err))
		return
	}
	defer rows.Close()

	calls := []map[string]any{}
	for rows.Next() {
		var (
			callId       uint64
			timestamp    int64
			transcript   sql.NullString
			alertSummary sql.NullString
			parsedJSON   sql.NullString
			systemId     uint64
			talkgroupId  uint64
		)
		if err := rows.Scan(&callId, &timestamp, &transcript, &alertSummary, &parsedJSON, &systemId, &talkgroupId); err != nil {
			continue
		}

		system, sysOk := api.Controller.Systems.GetSystemById(systemId)
		if !sysOk {
			continue
		}
		talkgroup, tgOk := system.Talkgroups.GetTalkgroupById(talkgroupId)
		if !tgOk {
			continue
		}

		//* Same access filtering as the alerts feed
		minimalCall := &Call{Id: callId, System: system, Talkgroup: talkgroup, Timestamp: time.UnixMilli(timestamp)}
		if !api.Controller.userHasAccess(client.User, minimalCall) {
			continue
		}

		callMap := map[string]any{
			"callId":         callId,
			"timestamp":      timestamp,
			"systemId":       systemId,
			"talkgroupId":    talkgroupId,
			"systemLabel":    system.Label,
			"talkgroupLabel": talkgroup.Label,
		}
		if transcript.Valid && transcript.String != "" {
			t := transcript.String
			//* Units and channels are parsed at read time so rule changes apply
			if p := activeTranscriptParser.Load(); p != nil {
				corrected, annotations := p.AnnotateTranscript(t)
				t = corrected
				if len(annotations) > 0 {
					callMap["transcriptAnnotations"] = annotations
				}
			}
			callMap["transcript"] = t
		}
		if alertSummary.Valid && alertSummary.String != "" {
			callMap["alertSummary"] = alertSummary.String
		}
		if parsedJSON.Valid && parsedJSON.String != "" {
			var parsedAddr models.ParsedAddress
			if json.Unmarshal([]byte(parsedJSON.String), &parsedAddr) == nil {
				callMap["parsedAddress"] = parsedAddr
			}
		}
		calls = append(calls, callMap)
	}

	if len(calls) == 0 {
		api.exitWithError(w, http.StatusNotFound, "incident not found")
		return
	}

	result := incidentToMap(inc, time.Now().UnixMilli(), api.Controller.Options.FireIncidentTypes)
	result["calls"] = calls

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}
