// Copyright (C) 2026 Carter Carling
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT EVEN THE IMPLIED WARRANTY OF MERCHANTABILITY or FITNESS
// FOR A PARTICULAR PURPOSE.  See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>

package address

import (
	"testing"
)

func TestDedup(t *testing.T) {
	// Repeated dispatch message should be deduplicated
	input := "ENGINE 5 RESPOND TO FIRE AT 100 SOUTH MAIN. ENGINE 5 RESPOND TO FIRE AT 100 SOUTH MAIN."
	result := dedup(input)
	expected := "ENGINE 5 RESPOND TO FIRE AT 100 SOUTH MAIN."
	if result != expected {
		t.Errorf("dedup() = %q, want %q", result, expected)
	}

	// Short text should pass through unchanged
	short := "ENGINE 5"
	if dedup(short) != short {
		t.Errorf("dedup(%q) should return input unchanged", short)
	}

	// Non-repeated text should pass through
	single := "ENGINE 5 RESPOND TO STRUCTURE FIRE AT 805 SOUTH 300 WEST."
	if dedup(single) != single {
		t.Errorf("dedup(%q) should return input unchanged", single)
	}
}

func TestDedupWithTimestamp(t *testing.T) {
	input := "ENGINE 5 RESPOND TO FIRE AT 100 SOUTH MAIN. ENGINE 5 RESPOND TO FIRE AT 100 SOUTH MAIN. TIME OUT 14:30."
	result := dedup(input)
	expected := "ENGINE 5 RESPOND TO FIRE AT 100 SOUTH MAIN."
	if result != expected {
		t.Errorf("dedup() = %q, want %q", result, expected)
	}
}

func TestStripApartment(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"805 SOUTH CHEYENNE STREET, APARTMENT 0", "805 SOUTH CHEYENNE STREET"},
		{"100 MAIN STREET APT 5", "100 MAIN STREET"},
		{"200 ELM UNIT 3B", "200 ELM"},
		{"300 OAK SUITE 200", "300 OAK"},
		{"400 PINE STREET", "400 PINE STREET"},
	}
	for _, tt := range tests {
		got := stripApartment(tt.input)
		if got != tt.want {
			t.Errorf("stripApartment(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestSplitOnCross(t *testing.T) {
	addr, cross := splitOnCross("805 SOUTH CHEYENNE STREET ON 1520 WEST")
	if addr != "805 SOUTH CHEYENNE STREET" || cross != "1520 WEST" {
		t.Errorf("splitOnCross() = (%q, %q), want (805 SOUTH CHEYENNE STREET, 1520 WEST)", addr, cross)
	}

	addr2, cross2 := splitOnCross("100 MAIN STREET")
	if addr2 != "100 MAIN STREET" || cross2 != "" {
		t.Errorf("splitOnCross() = (%q, %q), want (100 MAIN STREET, empty)", addr2, cross2)
	}
}

func TestBuildGeocodeQuery(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		// Utah grid keeps its first direction
		{"805 SOUTH 300 WEST", "805 SOUTH 300 WEST"},
		// Grid with comma: comma dropped, direction kept
		{"235 WEST, 400 NORTH", "235 WEST 400 NORTH"},
		// Errant comma: "1990, WEST NORTH TEMPLE" -> "1990 WEST NORTH TEMPLE"
		{"1990, WEST NORTH TEMPLE", "1990 WEST NORTH TEMPLE"},
		// Cross street suffix: "2664 WEST HILL, 11400 SOUTH" -> "2664 WEST HILL"
		{"2664 WEST HILL, 11400 SOUTH", "2664 WEST HILL"},
		// Normal address passes through
		{"100 MAIN STREET", "100 MAIN STREET"},
	}
	for _, tt := range tests {
		got := buildGeocodeQuery(tt.input)
		if got != tt.want {
			t.Errorf("buildGeocodeQuery(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestParseAddressPatternA(t *testing.T) {
	// Pattern A: RESPOND TO [incident] AT [address]
	result := ParseAddress("ENGINE 5 TRUCK 2, RESPOND TO STRUCTURE FIRE AT 805 SOUTH 300 WEST. RESPOND ON CITY FIRE 3, NEAR 200 EAST.")
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	if result.Address != "805 SOUTH 300 WEST" {
		t.Errorf("Address = %q, want %q", result.Address, "805 SOUTH 300 WEST")
	}
	if result.IncidentType != "STRUCTURE FIRE" {
		t.Errorf("IncidentType = %q, want %q", result.IncidentType, "STRUCTURE FIRE")
	}
	if result.Near != "200 EAST" {
		t.Errorf("Near = %q, want %q", result.Near, "200 EAST")
	}
	if result.Raw == "" {
		t.Error("Raw should not be empty")
	}
}

func TestParseAddressPatternAWithCity(t *testing.T) {
	// Pattern C: RESPOND TO ... AT ... IN [city]
	result := ParseAddress("ENGINE 1 RESPOND TO 21 FIRE AT 500 NORTH MAIN IN BOUNTIFUL.")
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	if result.City != "BOUNTIFUL" {
		t.Errorf("City = %q, want %q", result.City, "BOUNTIFUL")
	}
	if result.IncidentType != "21 FIRE" {
		t.Errorf("IncidentType = %q, want %q", result.IncidentType, "21 FIRE")
	}
}

func TestParseAddressPatternAWithDispatchCode(t *testing.T) {
	// Pattern A/C with explicit dispatch code (code, incident pattern)
	result := ParseAddress("ENGINE 1 RESPOND TO 21 MEDICAL, HEART ATTACK AT 500 NORTH MAIN.")
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	if result.DispatchCode != "21 MEDICAL" {
		t.Errorf("DispatchCode = %q, want %q", result.DispatchCode, "21 MEDICAL")
	}
}

func TestParseAddressPatternB(t *testing.T) {
	// Pattern B: PRIORITY N, ADDRESS
	result := ParseAddress("ENGINE 5, STRUCTURE FIRE, PRIORITY 1, 805 SOUTH 300 WEST. RESPOND ON CITY FIRE 3.")
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	if result.Address != "805 SOUTH 300 WEST" {
		t.Errorf("Address = %q, want %q", result.Address, "805 SOUTH 300 WEST")
	}
	if result.IncidentType != "STRUCTURE FIRE" {
		t.Errorf("IncidentType = %q, want %q", result.IncidentType, "STRUCTURE FIRE")
	}
}

func TestParseAddressPatternD(t *testing.T) {
	// Pattern D: INCIDENT, ADDRESS (no priority, no RESPOND TO)
	result := ParseAddress("ENGINE 5, FIRE ALARM, 378 WEST 300 SOUTH. RESPOND ON CITY FIRE 3.")
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	if result.IncidentType != "FIRE ALARM" {
		t.Errorf("IncidentType = %q, want %q", result.IncidentType, "FIRE ALARM")
	}
	if result.Address != "378 WEST 300 SOUTH" {
		t.Errorf("Address = %q, want %q", result.Address, "378 WEST 300 SOUTH")
	}
}

func TestParseAddressPatternE(t *testing.T) {
	// Pattern E: INCIDENT ADDRESS (no commas)
	result := ParseAddress("STRUCTURE FIRE 254 EAST 7TH AVENUE. RESPOND ON CITY FIRE 1.")
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	if result.Address != "254 EAST 7TH AVENUE" {
		t.Errorf("Address = %q, want %q", result.Address, "254 EAST 7TH AVENUE")
	}
}

func TestParseAddressWithApartment(t *testing.T) {
	result := ParseAddress("ENGINE 1, RESPOND TO MEDICAL AT 805 SOUTH CHEYENNE STREET, APARTMENT 0.")
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	// Apartment should be stripped
	if result.Address != "805 SOUTH CHEYENNE STREET" {
		t.Errorf("Address = %q, want %q", result.Address, "805 SOUTH CHEYENNE STREET")
	}
}

func TestParseAddressOnCrossStreet(t *testing.T) {
	result := ParseAddress("ENGINE 1, RESPOND TO MEDICAL AT 805 SOUTH CHEYENNE STREET ON 1520 WEST.")
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	if result.Address != "805 SOUTH CHEYENNE STREET" {
		t.Errorf("Address = %q, want %q", result.Address, "805 SOUTH CHEYENNE STREET")
	}
	if result.Near != "1520 WEST" {
		t.Errorf("Near = %q, want %q", result.Near, "1520 WEST")
	}
}

func TestParseAddressEmpty(t *testing.T) {
	if ParseAddress("") != nil {
		t.Error("expected nil for empty input")
	}
	if ParseAddress("NOTHING USEFUL HERE") != nil {
		t.Error("expected nil for non-matching input")
	}
}

func TestDedup_AlmostRepeated(t *testing.T) {
	// Text that is similar but not an exact repetition should pass through unchanged
	input := "ENGINE 5 RESPOND TO FIRE AT 100 SOUTH MAIN. ENGINE 5 RESPOND TO MEDICAL AT 200 NORTH MAIN."
	result := dedup(input)
	if result != input {
		t.Errorf("dedup() modified near-duplicate text that should pass through:\ngot:  %q\nwant: %q", result, input)
	}
}

func TestBuildGeocodeQuery_CommaNoSpace(t *testing.T) {
	// Address with comma immediately after number (no space) should still normalize cleanly
	result := buildGeocodeQuery("100,MAIN STREET")
	if result == "" {
		t.Error("buildGeocodeQuery(\"100,MAIN STREET\") = empty, want non-empty")
	}
}

func TestParseAddress_MultipleAt(t *testing.T) {
	// Transcript with multiple "AT" occurrences; address should be taken from
	// the first AT in the "RESPOND TO ... AT address" pattern
	input := "ENGINE 5, RESPOND TO FIRE AT 100 SOUTH MAIN AT CROSS STREET."
	result := ParseAddress(input)
	// Must not panic; if matched, the address portion should be non-empty
	if result != nil && result.Address == "" {
		t.Error("ParseAddress with multiple AT returned result with empty Address")
	}
}

func TestParseAddressGeocodeQuery(t *testing.T) {
	result := ParseAddress("ENGINE 5, RESPOND TO FIRE AT 805 SOUTH 300 WEST.")
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	// Utah grid normalization keeps the first direction
	if result.GeocodeQuery != "805 SOUTH 300 WEST" {
		t.Errorf("GeocodeQuery = %q, want %q", result.GeocodeQuery, "805 SOUTH 300 WEST")
	}
}

func TestParseAddressCommaAfterHouseNumber(t *testing.T) {
	//* Dispatchers pause after the house number; the comma must not break
	//* incident extraction (this exact shape was seen in prod unparsed)
	result := ParseAddress("ENGINE 2, COMPANY 4, AND COMPANY 9, FIELD OR GRASS FIRE, 1300, SOUTH I-15 SOUTHBOUND FREEWAY. RESPOND ON CITY FIRE 2.")
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	if result.IncidentType != "FIELD OR GRASS FIRE" {
		t.Errorf("IncidentType = %q, want %q", result.IncidentType, "FIELD OR GRASS FIRE")
	}
	if result.Address != "1300, SOUTH I-15 SOUTHBOUND FREEWAY" {
		t.Errorf("Address = %q, want %q", result.Address, "1300, SOUTH I-15 SOUTHBOUND FREEWAY")
	}
	if result.GeocodeQuery != "1300 SOUTH I-15 SOUTHBOUND FREEWAY" {
		t.Errorf("GeocodeQuery = %q, want %q", result.GeocodeQuery, "1300 SOUTH I-15 SOUTHBOUND FREEWAY")
	}
}

func TestParseAddressProdShapes(t *testing.T) {
	//* Regression suite of real prod transcript shapes that used to fail
	tests := []struct {
		name         string
		transcript   string
		wantIncident string
		wantAddress  string
	}{
		{
			"no comma before PRIORITY",
			"MEDIC SQUAD 6, ASSAULT PRIORITY 3, 36 WEST FREMONT AVENUE ON 1110 SOUTH. RESPOND ON CITY FIRE 2.",
			"ASSAULT", "36 WEST FREMONT AVENUE",
		},
		{
			"period before PRIORITY",
			"SQUAD 6 AND CHAT 6, UNKNOWN MEDICAL PROBLEM. PRIORITY 3, 1818 SOUTH 300 WEST. RESPOND ON CHI FIRE 2.",
			"UNKNOWN MEDICAL PROBLEM", "1818 SOUTH 300 WEST",
		},
		{
			"period after PRIORITY digit",
			"CHAT 5. PSYCHIATRIC PROBLEM. PRIORITY 4. 1214 WEST 400 SOUTH. RESPOND ON CITY FIRE 2.",
			"PSYCHIATRIC PROBLEM", "1214 WEST 400 SOUTH",
		},
		{
			"incident after unit number without comma",
			"QUINT 14 MEDICAL ALARM, PRIORITY 3, 1960 SOUTH INDUSTRIAL ROAD ON 1900 WEST. RESPOND ON CITY FIRE 2.",
			"MEDICAL ALARM", "1960 SOUTH INDUSTRIAL ROAD",
		},
		{
			"apostrophe in incident",
			"MEDIC SQUAD 2, CHILLER'S FALL, PRIORITY 3, 1369 WEST DORAY AVENUE ON 440 NORTH.",
			"CHILLER'S FALL", "1369 WEST DORAY AVENUE",
		},
		{
			"hyphenated incident with apartment",
			"BATTALION 1, TRUCK 2, HIGH-RISE FIRE, 89 EAST 200 SOUTH, APARTMENT 522.",
			"HIGH-RISE FIRE", "89 EAST 200 SOUTH",
		},
		{
			"period separates incident from address",
			"MEDIC ENGINE 2, MEDIC. 158 NORTH, 600 WEST, APARTMENT 223. RESPOND ON CITY FIRE 2.",
			"MEDIC", "158 NORTH, 600 WEST",
		},
		{
			"freeway fire with no house number",
			"COMPANY 6, FIELD OR GRASS FIRE, I-80 WESTBOUND TO I-80 WESTBOUND RAMP AND SOUTH I-215E NORTHBOUND FREEWAY.",
			"FIELD OR GRASS FIRE", "I-80 WESTBOUND TO I-80 WESTBOUND RAMP AND SOUTH I-215E NORTHBOUND FREEWAY",
		},
		{
			"repeat carries the AT, incident must not span sentences",
			"BATTALION 11 AND MEDIC ENGINE 112, RESPOND TO VEHICLE FIRE, 10,700, EAST I-80 WESTBOUND FREEWAY. RESPOND ON DECK, FIRE 2. BATTALION 11 AND MEDIC ENGINE 112, RESPOND TO VEHICLE FIRE AT 10,700, EAST I-80 WESTBOUND FREEWAY. RESPOND ON DECK, FIRE 2. TIME OUT, 07:45.",
			"VEHICLE FIRE", "10700, EAST I-80 WESTBOUND FREEWAY",
		},
		{
			"period between incident and AT",
			"MEDIC ENGINE 63 AND MEDIC AMBULANCE 63, RESPOND TO STATION MOVE-UP. AT STATION 106. TIME OUT 1810",
			"STATION MOVE-UP", "STATION 106",
		},
	}
	for _, tt := range tests {
		result := ParseAddress(tt.transcript)
		if result == nil {
			t.Errorf("%s: ParseAddress returned nil", tt.name)
			continue
		}
		if result.IncidentType != tt.wantIncident {
			t.Errorf("%s: IncidentType = %q, want %q", tt.name, result.IncidentType, tt.wantIncident)
		}
		if result.Address != tt.wantAddress {
			t.Errorf("%s: Address = %q, want %q", tt.name, result.Address, tt.wantAddress)
		}
	}
}

func TestSplitAddressGridDirections(t *testing.T) {
	parts := splitAddress("1300 SOUTH 900 WEST")
	if parts == nil {
		t.Fatal("expected non-nil parts")
	}
	if parts.AddNum != "1300" || parts.PrefixDir != "S" || parts.StreetName != "900" || parts.SuffixDir != "W" {
		t.Errorf("splitAddress() = %+v, want AddNum=1300 PrefixDir=S StreetName=900 SuffixDir=W", parts)
	}
}

func TestDirsConsistent(t *testing.T) {
	grid := splitAddress("1300 SOUTH 900 WEST")
	if grid == nil {
		t.Fatal("expected non-nil parts")
	}
	tests := []struct {
		name string
		cand candidate
		want bool
	}{
		{"exact agreement", candidate{PrefixDir: "S", SuffixDir: "W"}, true},
		{"transposed directions", candidate{PrefixDir: "W", SuffixDir: "S"}, false},
		{"prefix flip only", candidate{PrefixDir: "N", SuffixDir: "W"}, false},
		{"suffix flip only", candidate{PrefixDir: "S", SuffixDir: "E"}, false},
		{"empty row dirs are consistent", candidate{}, true},
	}
	for _, tt := range tests {
		if got := dirsConsistent(&tt.cand, grid); got != tt.want {
			t.Errorf("%s: dirsConsistent() = %v, want %v", tt.name, got, tt.want)
		}
	}

	//* Single spoken direction: enforcement is off
	named := splitAddress("805 SOUTH CHEYENNE STREET")
	if named == nil {
		t.Fatal("expected non-nil parts")
	}
	if !dirsConsistent(&candidate{PrefixDir: "N"}, named) {
		t.Error("dirsConsistent() with single spoken direction should be true")
	}
}
