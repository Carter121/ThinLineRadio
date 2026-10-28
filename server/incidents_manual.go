package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"rdio-scanner/server/internal/models"
)

func migrateManualIncidents(db *Database) error {
	tx, err := db.Sql.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	rows, err := tx.Query(`SELECT DISTINCT "incidentId" FROM "incidentCalls" WHERE "callId" IN (SELECT "callId" FROM "incidentCalls" GROUP BY "callId" HAVING COUNT(*)>1)`)
	if err != nil {
		return err
	}
	affected := []uint64{}
	for rows.Next() {
		var id uint64
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		affected = append(affected, id)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, query := range []string{
		`ALTER TABLE "calls" ADD COLUMN IF NOT EXISTS "incidentAssignmentManual" boolean NOT NULL DEFAULT false`,
		`ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "metadataManual" boolean NOT NULL DEFAULT false`,
		`DELETE FROM "incidentCalls" a USING "incidentCalls" b WHERE a."callId" = b."callId" AND (a."addedAt", a."incidentId") < (b."addedAt", b."incidentId")`,
		`CREATE UNIQUE INDEX IF NOT EXISTS "incidentCalls_one_incident" ON "incidentCalls" ("callId")`,
	} {
		if _, err := tx.Exec(query); err != nil {
			return err
		}
	}
	for _, id := range affected {
		if err := recalculateIncident(tx, id); err != nil {
			return err
		}
	}
	return tx.Commit()
}

type incidentMemberInput struct {
	CallID             uint64  `json:"callId"`
	ExpectedIncidentID *uint64 `json:"expectedIncidentId"`
}

type incidentMutationInput struct {
	IncidentType string                `json:"incidentType"`
	Address      string                `json:"address"`
	Calls        []incidentMemberInput `json:"calls"`
	Separate     bool                  `json:"separate,omitempty"`
}

// * Keep all derived membership data in the same transaction as its links.
func recalculateIncident(tx *sql.Tx, id uint64) error {
	rows, err := tx.Query(`SELECT c."timestamp", c."parsedAddress", t."talkgroupRef" FROM "incidentCalls" ic JOIN "calls" c ON c."callId" = ic."callId" JOIN "talkgroups" t ON t."talkgroupId" = c."talkgroupId" WHERE ic."incidentId" = $1 ORDER BY c."timestamp" DESC, c."callId" DESC`, id)
	if err != nil {
		return err
	}
	var first, last int64
	count := 0
	refs := []uint{}
	seen := map[uint]bool{}
	var lat, lon any
	for rows.Next() {
		var ts int64
		var parsed sql.NullString
		var ref uint
		if err := rows.Scan(&ts, &parsed, &ref); err != nil {
			rows.Close()
			return err
		}
		if count == 0 {
			first, last = ts, ts
		}
		if ts < first {
			first = ts
		}
		count++
		if !seen[ref] {
			seen[ref] = true
			refs = append(refs, ref)
		}
		if lat == nil && parsed.Valid {
			var addr models.ParsedAddress
			if json.Unmarshal([]byte(parsed.String), &addr) == nil && addr.Match != nil && (addr.Match.Precision == "rooftop" || addr.Match.Precision == "nearby") {
				lat, lon = addr.Match.Lat, addr.Match.Lon
			}
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	if count == 0 {
		_, err = tx.Exec(`DELETE FROM "incidents" WHERE "incidentId" = $1`, id)
		return err
	}
	sort.Slice(refs, func(i, j int) bool { return refs[i] < refs[j] })
	encoded, _ := json.Marshal(refs)
	_, err = tx.Exec(`UPDATE "incidents" SET "firstSeenAt"=$2, "lastSeenAt"=$3, "callCount"=$4, "talkgroupRefs"=$5, "lat"=$6, "lon"=$7 WHERE "incidentId"=$1`, id, first, last, count, string(encoded), lat, lon)
	return err
}

func (api *Api) canReadIncident(user *User, id uint64) (bool, error) {
	rows, err := api.Controller.Database.Sql.Query(`SELECT c."systemId", c."talkgroupId", c."timestamp" FROM "incidentCalls" ic JOIN "calls" c ON c."callId"=ic."callId" WHERE ic."incidentId"=$1`, id)
	if err != nil {
		return false, err
	}
	defer rows.Close()
	for rows.Next() {
		var sid, tid uint64
		var ts int64
		if err := rows.Scan(&sid, &tid, &ts); err != nil {
			return false, err
		}
		if api.canReadIncidentCall(user, sid, tid, ts) {
			return true, nil
		}
	}
	return false, rows.Err()
}

func (api *Api) canReadIncidentCall(user *User, sid, tid uint64, ts int64) bool {
	system, ok := api.Controller.Systems.GetSystemById(sid)
	if !ok {
		return false
	}
	tg, ok := system.Talkgroups.GetTalkgroupById(tid)
	return ok && api.Controller.userHasAccess(user, &Call{System: system, Talkgroup: tg, Timestamp: time.UnixMilli(ts)})
}

func validateIncidentMutation(input *incidentMutationInput, metadata, members bool) error {
	input.IncidentType = strings.TrimSpace(input.IncidentType)
	input.Address = strings.TrimSpace(input.Address)
	if metadata && (input.IncidentType == "" || len(input.IncidentType) > 200 || len(input.Address) > 500) {
		return fmt.Errorf("incident type is required (maximum 200 characters); address maximum is 500 characters")
	}
	if members && (len(input.Calls) == 0 || len(input.Calls) > 200) {
		return fmt.Errorf("select between 1 and 200 calls")
	}
	seen := map[uint64]bool{}
	for _, call := range input.Calls {
		if call.CallID == 0 || seen[call.CallID] {
			return fmt.Errorf("call IDs must be positive and unique")
		}
		seen[call.CallID] = true
	}
	return nil
}

func (api *Api) mutateIncident(w http.ResponseWriter, r *http.Request, client *Client, id uint64, members bool) {
	if !client.User.SystemAdmin {
		api.exitWithError(w, http.StatusForbidden, "system administrator access required")
		return
	}
	create := r.Method == http.MethodPost && id == 0
	metadata := create || r.Method == http.MethodPatch
	remove := r.Method == http.MethodDelete
	if !(create || id > 0 && (metadata && !members || members && (r.Method == http.MethodPut || remove))) {
		api.exitWithError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var input incidentMutationInput
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64*1024))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		api.exitWithError(w, 400, "invalid request body")
		return
	}
	if !create && metadata && len(input.Calls) > 0 {
		api.exitWithError(w, 400, "metadata updates cannot change membership")
		return
	}
	if err := validateIncidentMutation(&input, metadata, create || members); err != nil {
		api.exitWithError(w, 400, err.Error())
		return
	}
	if input.Separate && (!create || len(input.Calls) != 1 || input.Calls[0].ExpectedIncidentID == nil || *input.Calls[0].ExpectedIncidentID == 0) {
		api.exitWithError(w, 400, "separation requires one call in an existing incident")
		return
	}
	if id > 0 {
		accessible, err := api.canReadIncident(client.User, id)
		if err != nil {
			api.exitWithError(w, 500, "failed to check incident access")
			return
		}
		if !accessible {
			api.exitWithError(w, 404, "incident not found")
			return
		}
	}
	incidentAssignMutex.Lock()
	defer incidentAssignMutex.Unlock()
	tx, err := api.Controller.Database.Sql.Begin()
	if err != nil {
		api.exitWithError(w, 500, "failed to begin incident update")
		return
	}
	defer tx.Rollback()
	fail := func(err error) {
		api.Controller.Logs.LogEvent(LogLevelWarn, fmt.Sprintf("manual incident update: %v", err))
		api.exitWithError(w, 500, "failed to update incident")
	}
	if id > 0 {
		var locked uint64
		if err := tx.QueryRow(`SELECT "incidentId" FROM "incidents" WHERE "incidentId"=$1 FOR UPDATE`, id).Scan(&locked); err != nil {
			if err == sql.ErrNoRows {
				api.exitWithError(w, 404, "incident not found")
			} else {
				fail(err)
			}
			return
		}
	}
	affected := map[uint64]bool{}
	callIDs := []uint64{}
	sort.Slice(input.Calls, func(i, j int) bool { return input.Calls[i].CallID < input.Calls[j].CallID })
	for _, member := range input.Calls {
		var sid, tid uint64
		var ts int64
		if err := tx.QueryRow(`SELECT "systemId", "talkgroupId", "timestamp" FROM "calls" WHERE "callId"=$1 FOR UPDATE`, member.CallID).Scan(&sid, &tid, &ts); err != nil {
			if err == sql.ErrNoRows {
				api.exitWithError(w, 404, "call not found")
			} else {
				fail(err)
			}
			return
		}
		if !api.canReadIncidentCall(client.User, sid, tid, ts) {
			api.exitWithError(w, 404, "call not found")
			return
		}
		var current uint64
		if err := tx.QueryRow(`SELECT "incidentId" FROM "incidentCalls" WHERE "callId"=$1`, member.CallID).Scan(&current); err != nil && err != sql.ErrNoRows {
			fail(err)
			return
		}
		expected := uint64(0)
		if member.ExpectedIncidentID != nil {
			expected = *member.ExpectedIncidentID
		}
		if current != expected || remove && current != id {
			api.exitWithError(w, 409, "incident membership changed; refresh and review your selection")
			return
		}
		if current > 0 {
			affected[current] = true
		}
		callIDs = append(callIDs, member.CallID)
	}
	if input.Separate {
		var count int
		if err := tx.QueryRow(`SELECT COUNT(*) FROM "incidentCalls" WHERE "incidentId"=$1`, *input.Calls[0].ExpectedIncidentID).Scan(&count); err != nil {
			fail(err)
			return
		}
		if count <= 1 {
			api.exitWithError(w, 409, "this incident only has one call; edit the incident instead")
			return
		}
	}
	if create {
		if err := tx.QueryRow(`INSERT INTO "incidents" ("firstSeenAt","lastSeenAt","incidentType","displayAddress","normalizedAddress","metadataManual") VALUES (0,0,$1,$2,$3,true) RETURNING "incidentId"`, input.IncidentType, input.Address, normalizeIncidentAddress(input.Address)).Scan(&id); err != nil {
			fail(err)
			return
		}
	} else if metadata {
		if _, err := tx.Exec(`UPDATE "incidents" SET "incidentType"=$2,"displayAddress"=$3,"normalizedAddress"=$4,"metadataManual"=true WHERE "incidentId"=$1`, id, input.IncidentType, input.Address, normalizeIncidentAddress(input.Address)); err != nil {
			fail(err)
			return
		}
		rows, err := tx.Query(`SELECT "callId" FROM "incidentCalls" WHERE "incidentId"=$1`, id)
		if err != nil {
			fail(err)
			return
		}
		for rows.Next() {
			var callID uint64
			if err := rows.Scan(&callID); err != nil {
				rows.Close()
				fail(err)
				return
			}
			callIDs = append(callIDs, callID)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			fail(err)
			return
		}
	}
	for _, member := range input.Calls {
		if _, err := tx.Exec(`DELETE FROM "incidentCalls" WHERE "callId"=$1`, member.CallID); err != nil {
			fail(err)
			return
		}
		if !remove {
			if _, err := tx.Exec(`INSERT INTO "incidentCalls" ("incidentId","callId","addedAt") VALUES ($1,$2,$3)`, id, member.CallID, time.Now().UnixMilli()); err != nil {
				fail(err)
				return
			}
		}
		if _, err := tx.Exec(`UPDATE "calls" SET "incidentAssignmentManual"=true WHERE "callId"=$1`, member.CallID); err != nil {
			fail(err)
			return
		}
	}
	affected[id] = true
	for affectedID := range affected {
		if err := recalculateIncident(tx, affectedID); err != nil {
			fail(err)
			return
		}
	}
	if err := tx.Commit(); err != nil {
		fail(err)
		return
	}
	api.Controller.Logs.LogEvent(LogLevelInfo, fmt.Sprintf("user %d manually updated incident %d (%s, %d calls)", client.User.Id, id, r.Method, len(input.Calls)))
	go api.Controller.broadcastManualIncidentPoke(id, callIDs)
	w.Header().Set("Content-Type", "application/json")
	if create {
		w.WriteHeader(http.StatusCreated)
	}
	json.NewEncoder(w).Encode(map[string]any{"incidentId": id, "callIds": callIDs})
}

func (controller *Controller) broadcastManualIncidentPoke(id uint64, callIDs []uint64) {
	controller.Clients.mutex.Lock()
	defer controller.Clients.mutex.Unlock()
	msg := &Message{Command: MessageCommandAlert, Payload: map[string]any{"type": "incident", "incidentId": id, "callIds": callIDs, "silent": true}}
	for client := range controller.Clients.Map {
		if client.User != nil {
			select {
			case client.Send <- msg:
			default:
			}
		}
	}
}

func incidentPath(path string) (uint64, bool, error) {
	tail := strings.Trim(strings.TrimPrefix(path, "/api/incidents"), "/")
	if tail == "" {
		return 0, false, nil
	}
	parts := strings.Split(tail, "/")
	id, err := strconv.ParseUint(parts[0], 10, 64)
	if err != nil || id == 0 || len(parts) > 2 || len(parts) == 2 && parts[1] != "calls" {
		return 0, false, fmt.Errorf("invalid incident path")
	}
	return id, len(parts) == 2, nil
}
