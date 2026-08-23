// ****************************************************************************
// Copyright (C) 2025 Thinline Dynamic Solutions
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
// ****************************************************************************

package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

// Targeted admin endpoints for editing one system, talkgroup, or unit without rewriting the
// whole systems tree. The legacy PUT /api/admin/systems/save path (still used by the old admin
// UI) rebuilds and rewrites every system/talkgroup/unit row on each save, which takes seconds
// on large systems; these routes write only the affected rows and then reload the in-memory
// systems list so every consumer (lookups cache, config broadcast) stays consistent.
//
// Routes (dispatched by SystemsRouter, mounted at /api/admin/systems/ behind requireLocalhost;
// the more specific legacy /systems/save and /systems/delete/ patterns keep winning in ServeMux):
//
//	PATCH  /api/admin/systems/{sid}                    partial system fields; "sites" (if present) replaces the site list
//	POST   /api/admin/systems/{sid}/talkgroups         create a talkgroup (body: talkgroup object)
//	PATCH  /api/admin/systems/{sid}/talkgroups         bulk edit {ids, set?, addGroupIds?, removeGroupIds?}
//	PUT    /api/admin/systems/{sid}/talkgroups/order   {ids} sets "order" = position for the listed talkgroups
//	POST   /api/admin/systems/{sid}/talkgroups/delete  bulk delete {ids}
//	PATCH  /api/admin/systems/{sid}/talkgroups/{tid}   partial talkgroup fields
//	DELETE /api/admin/systems/{sid}/talkgroups/{tid}
//	POST   /api/admin/systems/{sid}/units              create a unit (body: unit object)
//	POST   /api/admin/systems/{sid}/units/delete       bulk delete {ids}
//	PATCH  /api/admin/systems/{sid}/units/{uid}        partial unit fields
//	DELETE /api/admin/systems/{sid}/units/{uid}
//
// Responses carry the affected entity ({"system": ...} without talkgroups/units, {"talkgroup": ...},
// {"unit": ...}, or {"deleted": n}); the full config is pushed separately over the admin websocket.

func (admin *Admin) SystemsRouter(w http.ResponseWriter, r *http.Request) {
	t := admin.GetAuthorization(r)
	if !admin.ValidateToken(t) {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	parts := strings.Split(strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/admin/systems/"), "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	systemId, err := strconv.ParseUint(parts[0], 10, 64)
	if err != nil || systemId == 0 {
		adminJSONError(w, http.StatusBadRequest, "invalid system id")
		return
	}

	switch {
	case len(parts) == 1:
		if r.Method == http.MethodPatch {
			admin.systemPatch(w, r, systemId)
			return
		}

	case parts[1] == "talkgroups":
		switch {
		case len(parts) == 2 && r.Method == http.MethodPost:
			admin.talkgroupCreate(w, r, systemId)
			return
		case len(parts) == 2 && r.Method == http.MethodPatch:
			admin.talkgroupBulkPatch(w, r, systemId)
			return
		case len(parts) == 3 && parts[2] == "order" && r.Method == http.MethodPut:
			admin.talkgroupReorder(w, r, systemId)
			return
		case len(parts) == 3 && parts[2] == "delete" && r.Method == http.MethodPost:
			admin.talkgroupBulkDelete(w, r, systemId)
			return
		case len(parts) == 3:
			talkgroupId, err := strconv.ParseUint(parts[2], 10, 64)
			if err != nil || talkgroupId == 0 {
				adminJSONError(w, http.StatusBadRequest, "invalid talkgroup id")
				return
			}
			switch r.Method {
			case http.MethodPatch:
				admin.talkgroupPatch(w, r, systemId, talkgroupId)
				return
			case http.MethodDelete:
				admin.talkgroupDelete(w, systemId, []uint64{talkgroupId})
				return
			}
		}

	case parts[1] == "units":
		switch {
		case len(parts) == 2 && r.Method == http.MethodPost:
			admin.unitCreate(w, r, systemId)
			return
		case len(parts) == 3 && parts[2] == "delete" && r.Method == http.MethodPost:
			admin.unitBulkDelete(w, r, systemId)
			return
		case len(parts) == 3:
			unitId, err := strconv.ParseUint(parts[2], 10, 64)
			if err != nil || unitId == 0 {
				adminJSONError(w, http.StatusBadRequest, "invalid unit id")
				return
			}
			switch r.Method {
			case http.MethodPatch:
				admin.unitPatch(w, r, systemId, unitId)
				return
			case http.MethodDelete:
				admin.unitDelete(w, systemId, []uint64{unitId})
				return
			}
		}
	}

	w.WriteHeader(http.StatusMethodNotAllowed)
}

func adminJSONError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}

func adminJSON(w http.ResponseWriter, payload any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(payload)
}

func decodeJSONMap(r *http.Request) (map[string]any, error) {
	m := map[string]any{}
	if err := json.NewDecoder(r.Body).Decode(&m); err != nil {
		return nil, err
	}
	return m, nil
}

// roundTripMap converts any JSON-marshalable value into a generic map so FromMap can rebuild it.
func roundTripMap(v any) (map[string]any, error) {
	b, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	m := map[string]any{}
	if err := json.Unmarshal(b, &m); err != nil {
		return nil, err
	}
	return m, nil
}

func idsFromAny(v any) []uint64 {
	ids := []uint64{}
	list, ok := v.([]any)
	if !ok {
		return ids
	}
	for _, item := range list {
		if f, ok := item.(float64); ok && f > 0 {
			ids = append(ids, uint64(f))
		}
	}
	return ids
}

func (admin *Admin) systemById(id uint64) (*System, bool) {
	return admin.Controller.Systems.GetSystemById(id)
}

// reloadSystems re-reads the systems tree from the database after a targeted write and
// refreshes the dependent caches, then broadcasts the new config. Call with admin.mutex held.
func (admin *Admin) reloadSystems(context string) error {
	if err := admin.Controller.Systems.Read(admin.Controller.Database); err != nil {
		admin.Controller.Logs.LogEvent(LogLevelError, fmt.Sprintf("%s.reload: %s", context, err.Error()))
		return err
	}
	if err := admin.Controller.IdLookupsCache.Read(admin.Controller.Database); err != nil {
		admin.Controller.Logs.LogEvent(LogLevelWarn, fmt.Sprintf("failed to reload ID lookups cache: %v", err))
	}
	return nil
}

func (admin *Admin) afterSystemsWrite() {
	go admin.Controller.EmitConfig()
	admin.Controller.SyncConfigToFile()
}

// runTx runs fn inside a transaction and commits when it returns nil.
func (admin *Admin) runTx(fn func(tx *sql.Tx) error) error {
	tx, err := admin.Controller.Database.Sql.Begin()
	if err != nil {
		return err
	}
	if err := fn(tx); err != nil {
		tx.Rollback()
		return err
	}
	return tx.Commit()
}

// ---------------------------------------------------------------------------
// Systems
// ---------------------------------------------------------------------------

// systemSummary is the system JSON minus the large child lists.
func systemSummary(system *System) map[string]any {
	m, err := roundTripMap(system)
	if err != nil {
		return map[string]any{"id": system.Id}
	}
	delete(m, "talkgroups")
	delete(m, "units")
	return m
}

type talkgroupRolloutFlags struct {
	toneDetection  bool
	autoLearnTones bool
	autoLearnUnits bool
}

func (admin *Admin) systemPatch(w http.ResponseWriter, r *http.Request, systemId uint64) {
	patch, err := decodeJSONMap(r)
	if err != nil {
		adminJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	// Child lists have their own endpoints; never let a system PATCH touch them.
	delete(patch, "talkgroups")
	delete(patch, "units")
	delete(patch, "id")

	admin.mutex.Lock()
	defer admin.mutex.Unlock()

	existing, ok := admin.systemById(systemId)
	if !ok {
		adminJSONError(w, http.StatusNotFound, "system not found")
		return
	}

	// Rebuild a detached copy (including talkgroups, for the tag-based rollouts) from the
	// existing JSON overlaid with the patch, so nothing shared is mutated before the commit.
	merged, err := roundTripMap(existing)
	if err != nil {
		adminJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	for k, v := range patch {
		merged[k] = v
	}
	updated := NewSystem().FromMap(merged)
	updated.Id = existing.Id

	if strings.TrimSpace(updated.Label) == "" {
		adminJSONError(w, http.StatusBadRequest, "label is required")
		return
	}
	if updated.SystemRef == 0 {
		adminJSONError(w, http.StatusBadRequest, "systemRef is required")
		return
	}
	for _, other := range admin.Controller.Systems.List {
		if other.Id != existing.Id && other.SystemRef == updated.SystemRef {
			adminJSONError(w, http.StatusConflict, fmt.Sprintf("system id %d is already used by %q", updated.SystemRef, other.Label))
			return
		}
	}

	before := map[uint64]talkgroupRolloutFlags{}
	for _, tg := range updated.Talkgroups.List {
		before[tg.Id] = talkgroupRolloutFlags{tg.ToneDetectionEnabled, tg.AutoLearnToneSets, tg.AutoLearnUnitAliases}
	}
	updated.applyBulkToneDetection()
	updated.applyAutoLearnToneSetsRollout()
	updated.applyAutoLearnUnitAliasesRollout()

	_, sitesProvided := patch["sites"]
	dbType := admin.Controller.Database.Config.DbType

	err = admin.runTx(func(tx *sql.Tx) error {
		if err := writeSystemRowTx(tx, dbType, updated); err != nil {
			return err
		}
		if sitesProvided {
			if err := updated.Sites.WriteTx(tx, updated.Id); err != nil {
				return err
			}
		}
		for _, tg := range updated.Talkgroups.List {
			prev, known := before[tg.Id]
			now := talkgroupRolloutFlags{tg.ToneDetectionEnabled, tg.AutoLearnToneSets, tg.AutoLearnUnitAliases}
			if known && prev == now {
				continue
			}
			if err := writeTalkgroupTx(tx, updated.Id, dbType, tg); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		admin.Controller.Logs.LogEvent(LogLevelError, fmt.Sprintf("admin.systems.patch: %s", err.Error()))
		adminJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if !updated.AlertsEnabled {
		cleanupDisabledAlertPreferences(admin.Controller.Database)
	}
	if err := admin.reloadSystems("admin.systems.patch"); err != nil {
		adminJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	admin.afterSystemsWrite()

	system, _ := admin.systemById(systemId)
	adminJSON(w, map[string]any{"system": systemSummary(system)})
}

// ---------------------------------------------------------------------------
// Talkgroups
// ---------------------------------------------------------------------------

func validateTalkgroup(system *System, tg *Talkgroup) (int, string) {
	if tg.TalkgroupRef == 0 {
		return http.StatusBadRequest, "talkgroupRef is required"
	}
	if strings.TrimSpace(tg.Label) == "" {
		return http.StatusBadRequest, "label is required"
	}
	for _, other := range system.Talkgroups.List {
		if other.Id != tg.Id && other.TalkgroupRef == tg.TalkgroupRef {
			return http.StatusConflict, fmt.Sprintf("talkgroup id %d is already used by %q", tg.TalkgroupRef, other.Label)
		}
	}
	return 0, ""
}

func (admin *Admin) findTalkgroup(system *System, id uint64) *Talkgroup {
	tg, ok := system.Talkgroups.GetTalkgroupById(id)
	if !ok {
		return nil
	}
	return tg
}

func (admin *Admin) respondTalkgroup(w http.ResponseWriter, systemId uint64, talkgroupId uint64) {
	system, ok := admin.systemById(systemId)
	if !ok {
		adminJSONError(w, http.StatusNotFound, "system not found")
		return
	}
	tg := admin.findTalkgroup(system, talkgroupId)
	if tg == nil {
		adminJSONError(w, http.StatusNotFound, "talkgroup not found")
		return
	}
	adminJSON(w, map[string]any{"talkgroup": tg})
}

func (admin *Admin) talkgroupCreate(w http.ResponseWriter, r *http.Request, systemId uint64) {
	body, err := decodeJSONMap(r)
	if err != nil {
		adminJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	delete(body, "id")
	if _, has := body["alertsEnabled"]; !has {
		body["alertsEnabled"] = true
	}

	admin.mutex.Lock()
	defer admin.mutex.Unlock()

	system, ok := admin.systemById(systemId)
	if !ok {
		adminJSONError(w, http.StatusNotFound, "system not found")
		return
	}

	tg := NewTalkgroup().FromMap(body)
	tg.Id = 0
	if status, msg := validateTalkgroup(system, tg); status != 0 {
		adminJSONError(w, status, msg)
		return
	}
	if tg.Order == 0 {
		tg.Order = uint(len(system.Talkgroups.List) + 1)
	}

	dbType := admin.Controller.Database.Config.DbType
	if err := admin.runTx(func(tx *sql.Tx) error { return writeTalkgroupTx(tx, systemId, dbType, tg) }); err != nil {
		admin.Controller.Logs.LogEvent(LogLevelError, fmt.Sprintf("admin.talkgroups.create: %s", err.Error()))
		adminJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := admin.reloadSystems("admin.talkgroups.create"); err != nil {
		adminJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	admin.afterSystemsWrite()
	admin.respondTalkgroup(w, systemId, tg.Id)
}

func (admin *Admin) talkgroupPatch(w http.ResponseWriter, r *http.Request, systemId uint64, talkgroupId uint64) {
	patch, err := decodeJSONMap(r)
	if err != nil {
		adminJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	delete(patch, "id")

	admin.mutex.Lock()
	defer admin.mutex.Unlock()

	system, ok := admin.systemById(systemId)
	if !ok {
		adminJSONError(w, http.StatusNotFound, "system not found")
		return
	}
	existing := admin.findTalkgroup(system, talkgroupId)
	if existing == nil {
		adminJSONError(w, http.StatusNotFound, "talkgroup not found")
		return
	}

	merged, err := roundTripMap(existing)
	if err != nil {
		adminJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	for k, v := range patch {
		merged[k] = v
	}
	tg := NewTalkgroup().FromMap(merged)
	tg.Id = existing.Id
	if status, msg := validateTalkgroup(system, tg); status != 0 {
		adminJSONError(w, status, msg)
		return
	}

	dbType := admin.Controller.Database.Config.DbType
	if err := admin.runTx(func(tx *sql.Tx) error { return writeTalkgroupTx(tx, systemId, dbType, tg) }); err != nil {
		admin.Controller.Logs.LogEvent(LogLevelError, fmt.Sprintf("admin.talkgroups.patch: %s", err.Error()))
		adminJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !tg.AlertsEnabled {
		cleanupDisabledAlertPreferences(admin.Controller.Database)
	}
	if err := admin.reloadSystems("admin.talkgroups.patch"); err != nil {
		adminJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	admin.afterSystemsWrite()
	admin.respondTalkgroup(w, systemId, tg.Id)
}

// talkgroupBulkPatch applies the same field values (and group add/remove) to many talkgroups.
// Body: {"ids": [..], "set": {field: value, ...}, "addGroupIds": [..], "removeGroupIds": [..]}.
func (admin *Admin) talkgroupBulkPatch(w http.ResponseWriter, r *http.Request, systemId uint64) {
	body, err := decodeJSONMap(r)
	if err != nil {
		adminJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	ids := idsFromAny(body["ids"])
	if len(ids) == 0 {
		adminJSONError(w, http.StatusBadRequest, "ids is required")
		return
	}
	set, _ := body["set"].(map[string]any)
	delete(set, "id")
	delete(set, "talkgroupRef")
	delete(set, "groupIds")
	addGroups := idsFromAny(body["addGroupIds"])
	removeGroups := idsFromAny(body["removeGroupIds"])

	admin.mutex.Lock()
	defer admin.mutex.Unlock()

	system, ok := admin.systemById(systemId)
	if !ok {
		adminJSONError(w, http.StatusNotFound, "system not found")
		return
	}

	updates := []*Talkgroup{}
	for _, id := range ids {
		existing := admin.findTalkgroup(system, id)
		if existing == nil {
			continue
		}
		merged, err := roundTripMap(existing)
		if err != nil {
			adminJSONError(w, http.StatusInternalServerError, err.Error())
			return
		}
		for k, v := range set {
			merged[k] = v
		}
		tg := NewTalkgroup().FromMap(merged)
		tg.Id = existing.Id

		if len(addGroups) > 0 || len(removeGroups) > 0 {
			groupIds := []uint64{}
			for _, g := range tg.GroupIds {
				removed := false
				for _, rg := range removeGroups {
					if rg == g {
						removed = true
						break
					}
				}
				if !removed {
					groupIds = append(groupIds, g)
				}
			}
			for _, ag := range addGroups {
				present := false
				for _, g := range groupIds {
					if g == ag {
						present = true
						break
					}
				}
				if !present {
					groupIds = append(groupIds, ag)
				}
			}
			tg.GroupIds = groupIds
		}
		updates = append(updates, tg)
	}

	dbType := admin.Controller.Database.Config.DbType
	err = admin.runTx(func(tx *sql.Tx) error {
		for _, tg := range updates {
			if err := writeTalkgroupTx(tx, systemId, dbType, tg); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		admin.Controller.Logs.LogEvent(LogLevelError, fmt.Sprintf("admin.talkgroups.bulk: %s", err.Error()))
		adminJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if v, ok := set["alertsEnabled"].(bool); ok && !v {
		cleanupDisabledAlertPreferences(admin.Controller.Database)
	}
	if err := admin.reloadSystems("admin.talkgroups.bulk"); err != nil {
		adminJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	admin.afterSystemsWrite()
	adminJSON(w, map[string]any{"updated": len(updates)})
}

// talkgroupReorder sets "order" to the 1-based position of each listed talkgroup.
func (admin *Admin) talkgroupReorder(w http.ResponseWriter, r *http.Request, systemId uint64) {
	body, err := decodeJSONMap(r)
	if err != nil {
		adminJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	ids := idsFromAny(body["ids"])
	if len(ids) == 0 {
		adminJSONError(w, http.StatusBadRequest, "ids is required")
		return
	}

	admin.mutex.Lock()
	defer admin.mutex.Unlock()

	if _, ok := admin.systemById(systemId); !ok {
		adminJSONError(w, http.StatusNotFound, "system not found")
		return
	}

	err = admin.runTx(func(tx *sql.Tx) error {
		for i, id := range ids {
			query := fmt.Sprintf(`UPDATE "talkgroups" SET "order" = %d WHERE "talkgroupId" = %d AND "systemId" = %d`, i+1, id, systemId)
			if _, err := tx.Exec(query); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		admin.Controller.Logs.LogEvent(LogLevelError, fmt.Sprintf("admin.talkgroups.reorder: %s", err.Error()))
		adminJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := admin.reloadSystems("admin.talkgroups.reorder"); err != nil {
		adminJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	admin.afterSystemsWrite()
	adminJSON(w, map[string]any{"updated": len(ids)})
}

func (admin *Admin) talkgroupBulkDelete(w http.ResponseWriter, r *http.Request, systemId uint64) {
	body, err := decodeJSONMap(r)
	if err != nil {
		adminJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	ids := idsFromAny(body["ids"])
	if len(ids) == 0 {
		adminJSONError(w, http.StatusBadRequest, "ids is required")
		return
	}
	admin.talkgroupDelete(w, systemId, ids)
}

// talkgroupDelete removes talkgroups (and their group links); calls cascade via the FK.
func (admin *Admin) talkgroupDelete(w http.ResponseWriter, systemId uint64, ids []uint64) {
	admin.mutex.Lock()
	defer admin.mutex.Unlock()

	system, ok := admin.systemById(systemId)
	if !ok {
		adminJSONError(w, http.StatusNotFound, "system not found")
		return
	}
	valid := []uint64{}
	for _, id := range ids {
		if admin.findTalkgroup(system, id) != nil {
			valid = append(valid, id)
		}
	}
	if len(valid) == 0 {
		adminJSONError(w, http.StatusNotFound, "talkgroup not found")
		return
	}

	b, _ := json.Marshal(valid)
	in := strings.ReplaceAll(strings.ReplaceAll(string(b), "[", "("), "]", ")")
	err := admin.runTx(func(tx *sql.Tx) error {
		if _, err := tx.Exec(fmt.Sprintf(`DELETE FROM "talkgroupGroups" WHERE "talkgroupId" IN %s`, in)); err != nil {
			return err
		}
		if _, err := tx.Exec(fmt.Sprintf(`DELETE FROM "talkgroups" WHERE "talkgroupId" IN %s AND "systemId" = %d`, in, systemId)); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		admin.Controller.Logs.LogEvent(LogLevelError, fmt.Sprintf("admin.talkgroups.delete: %s", err.Error()))
		adminJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := admin.reloadSystems("admin.talkgroups.delete"); err != nil {
		adminJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	admin.afterSystemsWrite()
	adminJSON(w, map[string]any{"deleted": len(valid)})
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

func validateUnit(system *System, unit *Unit) (int, string) {
	if strings.TrimSpace(unit.Label) == "" {
		return http.StatusBadRequest, "label is required"
	}
	if unit.UnitRef == 0 && (unit.UnitFrom == 0 || unit.UnitTo == 0) {
		return http.StatusBadRequest, "unitRef or a unitFrom/unitTo range is required"
	}
	if unit.UnitFrom > 0 && unit.UnitTo > 0 && unit.UnitTo < unit.UnitFrom {
		return http.StatusBadRequest, "unitTo must be greater than or equal to unitFrom"
	}
	if unit.UnitRef > 0 {
		for _, other := range system.Units.List {
			if other.Id != unit.Id && other.UnitRef == unit.UnitRef {
				return http.StatusConflict, fmt.Sprintf("unit id %d is already used by %q", unit.UnitRef, other.Label)
			}
		}
	}
	return 0, ""
}

func findUnit(system *System, id uint64) *Unit {
	for _, unit := range system.Units.List {
		if unit.Id == id {
			return unit
		}
	}
	return nil
}

func (admin *Admin) respondUnit(w http.ResponseWriter, systemId uint64, unitId uint64) {
	system, ok := admin.systemById(systemId)
	if !ok {
		adminJSONError(w, http.StatusNotFound, "system not found")
		return
	}
	unit := findUnit(system, unitId)
	if unit == nil {
		adminJSONError(w, http.StatusNotFound, "unit not found")
		return
	}
	adminJSON(w, map[string]any{"unit": unit})
}

func (admin *Admin) unitCreate(w http.ResponseWriter, r *http.Request, systemId uint64) {
	body, err := decodeJSONMap(r)
	if err != nil {
		adminJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	delete(body, "id")

	admin.mutex.Lock()
	defer admin.mutex.Unlock()

	system, ok := admin.systemById(systemId)
	if !ok {
		adminJSONError(w, http.StatusNotFound, "system not found")
		return
	}
	unit := NewUnit().FromMap(body)
	unit.Id = 0
	unit.SystemId = systemId
	if status, msg := validateUnit(system, unit); status != 0 {
		adminJSONError(w, status, msg)
		return
	}

	if err := admin.runTx(func(tx *sql.Tx) error { return writeUnitTx(tx, systemId, unit) }); err != nil {
		admin.Controller.Logs.LogEvent(LogLevelError, fmt.Sprintf("admin.units.create: %s", err.Error()))
		adminJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := admin.reloadSystems("admin.units.create"); err != nil {
		adminJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	admin.afterSystemsWrite()

	// A fresh insert has no id in memory; resolve it by unitRef after the reload.
	system, _ = admin.systemById(systemId)
	if unit.Id == 0 && unit.UnitRef > 0 {
		for _, u := range system.Units.List {
			if u.UnitRef == unit.UnitRef {
				unit.Id = u.Id
				break
			}
		}
	}
	if unit.Id == 0 {
		adminJSON(w, map[string]any{"unit": unit})
		return
	}
	admin.respondUnit(w, systemId, unit.Id)
}

func (admin *Admin) unitPatch(w http.ResponseWriter, r *http.Request, systemId uint64, unitId uint64) {
	patch, err := decodeJSONMap(r)
	if err != nil {
		adminJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	delete(patch, "id")

	admin.mutex.Lock()
	defer admin.mutex.Unlock()

	system, ok := admin.systemById(systemId)
	if !ok {
		adminJSONError(w, http.StatusNotFound, "system not found")
		return
	}
	existing := findUnit(system, unitId)
	if existing == nil {
		adminJSONError(w, http.StatusNotFound, "unit not found")
		return
	}
	merged, err := roundTripMap(existing)
	if err != nil {
		adminJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	// Unit.MarshalJSON omits zero fields; make the overlay explicit so FromMap sees the id.
	merged["id"] = float64(existing.Id)
	merged["unitRef"] = float64(existing.UnitRef)
	for k, v := range patch {
		merged[k] = v
	}
	unit := NewUnit().FromMap(merged)
	unit.Id = existing.Id
	unit.SystemId = systemId
	if status, msg := validateUnit(system, unit); status != 0 {
		adminJSONError(w, status, msg)
		return
	}

	if err := admin.runTx(func(tx *sql.Tx) error { return writeUnitTx(tx, systemId, unit) }); err != nil {
		admin.Controller.Logs.LogEvent(LogLevelError, fmt.Sprintf("admin.units.patch: %s", err.Error()))
		adminJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := admin.reloadSystems("admin.units.patch"); err != nil {
		adminJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	admin.afterSystemsWrite()
	admin.respondUnit(w, systemId, unit.Id)
}

func (admin *Admin) unitBulkDelete(w http.ResponseWriter, r *http.Request, systemId uint64) {
	body, err := decodeJSONMap(r)
	if err != nil {
		adminJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	ids := idsFromAny(body["ids"])
	if len(ids) == 0 {
		adminJSONError(w, http.StatusBadRequest, "ids is required")
		return
	}
	admin.unitDelete(w, systemId, ids)
}

func (admin *Admin) unitDelete(w http.ResponseWriter, systemId uint64, ids []uint64) {
	admin.mutex.Lock()
	defer admin.mutex.Unlock()

	system, ok := admin.systemById(systemId)
	if !ok {
		adminJSONError(w, http.StatusNotFound, "system not found")
		return
	}
	valid := []uint64{}
	for _, id := range ids {
		if findUnit(system, id) != nil {
			valid = append(valid, id)
		}
	}
	if len(valid) == 0 {
		adminJSONError(w, http.StatusNotFound, "unit not found")
		return
	}

	b, _ := json.Marshal(valid)
	in := strings.ReplaceAll(strings.ReplaceAll(string(b), "[", "("), "]", ")")
	err := admin.runTx(func(tx *sql.Tx) error {
		_, err := tx.Exec(fmt.Sprintf(`DELETE FROM "units" WHERE "unitId" IN %s AND "systemId" = %d`, in, systemId))
		return err
	})
	if err != nil {
		admin.Controller.Logs.LogEvent(LogLevelError, fmt.Sprintf("admin.units.delete: %s", err.Error()))
		adminJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := admin.reloadSystems("admin.units.delete"); err != nil {
		adminJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	admin.afterSystemsWrite()
	adminJSON(w, map[string]any{"deleted": len(valid)})
}
