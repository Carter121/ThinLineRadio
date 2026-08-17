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

import "testing"

func TestClassifyFireTier(t *testing.T) {
	rows := defaultFireIncidentTypes()

	tests := []struct {
		name         string
		incidentType string
		wantTier     string
		wantPriority int
		wantNotify   bool
	}{
		{"house fire is structure", "HOUSE FIRE", fireTierStructure, 5, true},
		{"field fire is wildland", "FIELD FIRE", fireTierWildland, 4, true},
		{"field or grass fire matches by substring", "FIELD OR GRASS FIRE", fireTierWildland, 4, true},
		{"dumpster fire never notifies", "DUMPSTER FIRE", fireTierNone, 0, false},
		{"fire alarm never notifies", "FIRE ALARM", fireTierNone, 0, false},
		{"gas leak never notifies", "NATURAL GAS LEAK", fireTierNone, 0, false},
		{"vehicle fire defaults to no notify", "VEHICLE FIRE", fireTierNone, 0, false},
		{"unmatched variant does not notify", "HOT FIRE", "", 0, false},
		{"empty incident type", "", "", 0, false},
		{"case insensitive", "house fire", fireTierStructure, 5, true},
		{"punctuation insensitive", "HIGH-RISE FIRE", fireTierStructure, 5, true},
		{"second alarm is structure", "SECOND ALARM", fireTierStructure, 5, true},
		{"fifth alarm is structure", "FIFTH ALARM", fireTierStructure, 5, true},
		//* Parser bug: incidentType swallowed the whole transcript. The none
		//* row for VEHICLE FIRE must still win by substring.
		{"swallowed transcript still matches none row", "VEHICLE FIRE, 10700, EAST I-80 WESTBOUND FREEWAY. RESPOND ON DECK, FIRE 2. BATTALION 11", fireTierNone, 0, false},
	}
	for _, tt := range tests {
		tier, priority, notify := classifyFireTier(tt.incidentType, rows)
		if tier != tt.wantTier || priority != tt.wantPriority || notify != tt.wantNotify {
			t.Errorf("%s: classifyFireTier(%q) = (%q, %d, %v), want (%q, %d, %v)",
				tt.name, tt.incidentType, tier, priority, notify, tt.wantTier, tt.wantPriority, tt.wantNotify)
		}
	}
}

func TestClassifyFireTierRowOrder(t *testing.T) {
	//* First match wins: an admin row ordering exclusions after a broad
	//* pattern changes the outcome, which is intended behavior
	rows := []FireIncidentType{
		{Pattern: "FIRE", Tier: fireTierStructure},
		{Pattern: "FIRE ALARM", Tier: fireTierNone},
	}
	tier, _, notify := classifyFireTier("FIRE ALARM", rows)
	if tier != fireTierStructure || !notify {
		t.Errorf("broad row first should win: got (%q, %v)", tier, notify)
	}
}
