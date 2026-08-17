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
	"fmt"
	"strings"

	"rdio-scanner/server/internal/models"
)

//* Fire notification tiers; ntfy priorities are structure 5, wildland 4
const (
	fireTierStructure = "structure"
	fireTierWildland  = "wildland"
	fireTierNone      = "none"
)

//* defaultFireIncidentTypes seeds the tier table from incident types observed
//* in production. "none" rows come first: matching is substring based and the
//* first match wins, so exclusions must outrank broader fire patterns.
func defaultFireIncidentTypes() []FireIncidentType {
	return []FireIncidentType{
		{Pattern: "FIRE ALARM", Tier: fireTierNone},
		{Pattern: "DUMPSTER FIRE", Tier: fireTierNone},
		{Pattern: "BARBECUE FIRE", Tier: fireTierNone},
		{Pattern: "GAS LEAK", Tier: fireTierNone},
		{Pattern: "EXPLOSIVE", Tier: fireTierNone},
		{Pattern: "HAZMAT", Tier: fireTierNone},
		{Pattern: "ODOR INVESTIGATION", Tier: fireTierNone},
		{Pattern: "SMOKE INVESTIGATION", Tier: fireTierNone},
		{Pattern: "FIRE INVESTIGATION", Tier: fireTierNone},
		{Pattern: "VEHICLE FIRE", Tier: fireTierNone},
		{Pattern: "TRUCK FIRE", Tier: fireTierNone},
		{Pattern: "STRUCTURE FIRE", Tier: fireTierStructure},
		{Pattern: "HOUSE FIRE", Tier: fireTierStructure},
		{Pattern: "APARTMENT FIRE", Tier: fireTierStructure},
		{Pattern: "COMMERCIAL FIRE", Tier: fireTierStructure},
		{Pattern: "BUILDING FIRE", Tier: fireTierStructure},
		{Pattern: "ELECTRICAL FIRE", Tier: fireTierStructure},
		{Pattern: "ELECTRIC FIRE", Tier: fireTierStructure},
		{Pattern: "GARAGE FIRE", Tier: fireTierStructure},
		{Pattern: "HIGHRISE FIRE", Tier: fireTierStructure},
		{Pattern: "SHED FIRE", Tier: fireTierStructure},
		{Pattern: "FIELD FIRE", Tier: fireTierWildland},
		{Pattern: "GRASS FIRE", Tier: fireTierWildland},
		{Pattern: "BRUSH FIRE", Tier: fireTierWildland},
		{Pattern: "TREE FIRE", Tier: fireTierWildland},
		{Pattern: "WILDLAND", Tier: fireTierWildland},
	}
}

//* fireTierPriority returns the ntfy priority for a notifying tier
func fireTierPriority(tier string) int {
	switch tier {
	case fireTierStructure:
		return 5
	case fireTierWildland:
		return 4
	}
	return 0
}

//* fireTierNotifies reports whether a tier value sends notifications
func fireTierNotifies(tier string) bool {
	return tier == fireTierStructure || tier == fireTierWildland
}

//* classifyFireTier maps an extracted incidentType to a notification tier.
//* Substring matching covers parser variants ("AN EQUIPMENT FIRE", "HOT FIRE")
//* and transcripts the parser failed to terminate cleanly. Returns tier "" and
//* notify false when nothing matches.
func classifyFireTier(incidentType string, rows []FireIncidentType) (tier string, priority int, notify bool) {
	upper := strings.ToUpper(strings.TrimSpace(incidentType))
	if upper == "" {
		return "", 0, false
	}
	for _, row := range rows {
		pattern := strings.ToUpper(strings.TrimSpace(row.Pattern))
		if pattern == "" || !strings.Contains(upper, pattern) {
			continue
		}
		switch row.Tier {
		case fireTierStructure, fireTierWildland:
			return row.Tier, fireTierPriority(row.Tier), true
		default:
			return fireTierNone, 0, false
		}
	}
	return "", 0, false
}

//* sendFireNtfy notifies the fire topic about a call on a fire incident.
//* No-ops when NTFY_FIRE_TOPIC is unset. The battalion path on the default
//* topic is independent: a house fire with a battalion sends on both.
func (controller *Controller) sendFireNtfy(callId uint64, priority int, incidentType string, parsedAddr *models.ParsedAddress, transcript string, update bool) {
	if controller.Options.NtfyFireTopic == "" {
		return
	}

	addr := ""
	if parsedAddr != nil {
		if parsedAddr.Match != nil && (parsedAddr.Match.Precision == "" || parsedAddr.Match.Precision == "rooftop") {
			addr = parsedAddr.Match.FullAddress
		} else if parsedAddr.OriginalAddress != "" {
			addr = parsedAddr.OriginalAddress
		} else {
			addr = parsedAddr.Address
		}
	}

	//* Cap runaway incident types (a known parser bug can swallow the whole
	//* transcript into incidentType)
	name := strings.ToUpper(strings.TrimSpace(incidentType))
	if len(name) > 60 {
		name = strings.TrimSpace(name[:60])
	}
	if name == "" {
		name = "FIRE INCIDENT"
	}

	title := name
	if addr != "" {
		title += ": " + addr
	}
	if update {
		title = "UPDATE: " + title
	}

	//* normalizePublicBaseURL localhost fallback never reaches subscribers
	clickUrl := ""
	if controller.Options.BaseUrl != "" {
		clickUrl = normalizePublicBaseURL(controller.Options.BaseUrl) + fmt.Sprintf("/alert/%d", callId)
	}

	controller.sendNtfyTo(controller.Options.NtfyFireTopic, title, strings.ToUpper(transcript), priority, []string{"fire"}, clickUrl)
}
