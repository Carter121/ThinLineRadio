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
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
)

//* CallsRouter dispatches the /api/calls/ prefix:
//* /api/calls/{id}/audio -> CallAudioDownloadHandler (unchanged contract)
//* /api/calls/{id}/meta  -> CallMetaHandler
func (api *Api) CallsRouter(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/"), "/")
	if len(parts) >= 4 && parts[0] == "api" && parts[1] == "calls" {
		switch parts[3] {
		case "audio":
			api.CallAudioDownloadHandler(w, r)
			return
		case "meta":
			api.CallMetaHandler(w, r)
			return
		}
	}
	api.exitWithError(w, http.StatusBadRequest, "Invalid path: expected /api/calls/{id}/audio or /api/calls/{id}/meta")
}

//* CallMetaHandler serves transcript/address/label metadata for a single call.
//*
//* GET /api/calls/{id}/meta
//* Auth: user PIN via ?pin= or Authorization: Bearer (same as the audio endpoint).
//* Used by the client-v2 /alert/{callId} page linked from ntfy notifications.
func (api *Api) CallMetaHandler(w http.ResponseWriter, r *http.Request) {
	//* This prefix bypasses corsMiddleware, so emit CORS headers here
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/"), "/")
	if len(parts) < 4 || parts[3] != "meta" {
		api.exitWithError(w, http.StatusBadRequest, "Invalid path: expected /api/calls/{id}/meta")
		return
	}

	callId, err := strconv.ParseUint(parts[2], 10, 64)
	if err != nil {
		api.exitWithError(w, http.StatusBadRequest, "Invalid call ID")
		return
	}

	client := api.getClient(r)
	if client == nil {
		w.Header().Set("WWW-Authenticate", `Bearer realm="TLR call metadata"`)
		api.exitWithError(w, http.StatusUnauthorized, "Invalid PIN")
		return
	}

	//* GetCall returns an error for unknown ids, so treat failures as not found
	call, err := api.Controller.Calls.GetCall(callId)
	if err != nil || call == nil {
		api.exitWithError(w, http.StatusNotFound, "Call not found")
		return
	}

	//* 404 (not 403) so existence isn't confirmed; admin tokens have no User and skip the check
	if client.User != nil && !api.Controller.userHasAccess(client.User, call) {
		api.exitWithError(w, http.StatusNotFound, "Call not found")
		return
	}

	meta := map[string]any{
		"callId":    call.Id,
		"timestamp": call.Timestamp.UnixMilli(),
		"hasAudio":  len(call.Audio) > 0,
	}
	if call.System != nil {
		meta["systemId"] = call.System.Id
		meta["systemLabel"] = call.System.Label
	}
	if call.Talkgroup != nil {
		meta["talkgroupId"] = call.Talkgroup.Id
		meta["talkgroupLabel"] = call.Talkgroup.Label
		meta["talkgroupName"] = call.Talkgroup.Name
	}
	if call.Transcript != "" {
		t := call.Transcript
		if p := activeTranscriptParser.Load(); p != nil {
			corrected, annotations := p.AnnotateTranscript(t)
			t = corrected
			if len(annotations) > 0 {
				meta["transcriptAnnotations"] = annotations
			}
		}
		meta["transcript"] = t
	}
	if call.TranscriptionStatus != "" {
		meta["transcriptionStatus"] = call.TranscriptionStatus
	}
	if call.AlertSummary != "" {
		meta["alertSummary"] = call.AlertSummary
	}
	if call.ParsedAddr != nil {
		meta["parsedAddress"] = call.ParsedAddr
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	if err := json.NewEncoder(w).Encode(meta); err != nil {
		api.Controller.Logs.LogEvent(LogLevelWarn, "callMetaHandler: failed to encode response: "+err.Error())
	}
}
