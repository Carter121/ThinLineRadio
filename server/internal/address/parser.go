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
	"math"
	"regexp"
	"strings"

	"rdio-scanner/server/internal/models"
)

// Address extraction patterns
var (
	// Pattern A/C: "RESPOND TO [code] [incident] AT [address] [IN city]".
	// The incident group must not cross a sentence boundary: dispatchers repeat
	// the message and sometimes only the repeat contains "AT", which used to
	// make the lazy group swallow everything up to the second half's AT.
	respondToAt = regexp.MustCompile(`(?i)RESPOND\s+TO\s+(?:(\d{1,2}\s+[A-Z]+)\s*,\s*)?([^.]+?)[.,]?\s+AT\s+(.+?)(?:\s+IN\s+([A-Z][A-Z\s]*?))?(?:\.|,?\s*RESPOND\s+ON|,?\s*NEAR\s|$)`)

	// Pattern B: "PRIORITY N, ADDRESS". Dispatchers vary the punctuation around
	// PRIORITY ("ASSAULT PRIORITY 3," / "PROBLEM. PRIORITY 2," / "PRIORITY 4. 1214"),
	// so both separators accept a comma or a period.
	priorityAddr = regexp.MustCompile(`(?i)\bPRIORITY\s+\d\s*[.,]\s*(.+?)(?:\.|,?\s*RESPOND\s+ON|$)`)

	// Incident type for pattern B (before PRIORITY). Anchored after punctuation
	// or a unit number ("QUINT 14 MEDICAL ALARM, PRIORITY 3"); allows hyphens
	// and apostrophes ("HIGH-RISE FIRE", "CHILLER'S FALL").
	priorityIncident = regexp.MustCompile(`(?i)(?:^|[.,]|\d)\s*([A-Z][A-Z\s'-]+?)\s*[.,]?\s*PRIORITY\s+\d`)

	// Pattern D: "INCIDENT, ADDRESS" where address starts with number + direction.
	// Dispatchers sometimes pause after the house number ("FIRE, 1300, SOUTH I-15"),
	// so an optional comma is allowed between the number and the direction. The
	// incident may end with a period ("MEDIC. 158 NORTH") and can contain hyphens
	// and apostrophes ("HIGH-RISE FIRE").
	commaIncidentAddr = regexp.MustCompile(`(?i)[.,]\s*([A-Z][A-Z\s'-]+?)\s*[.,]\s*(\d+(?:\s*,\s*|\s+)(?:NORTH|SOUTH|EAST|WEST|N|S|E|W)[,\s]+.+?)(?:\.|,?\s*RESPOND\s+ON|,?\s*ON\s+CITY|$)`)

	// Pattern D2: "INCIDENT, FREEWAY ADDRESS" (no house number). Freeway fires
	// ("FIELD OR GRASS FIRE, I-80 WESTBOUND ... RAMP") rarely geocode, but the
	// incident type must still be extracted so fire notifications fire.
	commaIncidentFreeway = regexp.MustCompile(`(?i)[.,]\s*([A-Z][A-Z\s'-]+?)\s*[.,]\s*((?:I|SR|US)-\d+\S*\s+.+?)(?:\.|,?\s*RESPOND\s+ON|,?\s*ON\s+CITY|$)`)

	// Pattern E: Known incident types followed by address (no commas)
	incidentAddrNoComma = regexp.MustCompile(`(?i)(ANIMAL\s+RESCUE|ROLLOVER|VEHICLE\s+FIRE|STRUCTURE\s+FIRE|FIRE\s+ALARM|GRASS\s+FIRE)\s+(\d+(?:\s*,\s*|\s+)(?:NORTH|SOUTH|EAST|WEST|N|S|E|W)\s+.+?)(?:\.|,?\s*RESPOND\s+ON|,?\s*ON\s+CITY|$)`)

	// NEAR cross street
	nearPattern = regexp.MustCompile(`(?i)NEAR\s+(.+?)(?:\.|,?\s*RESPOND|,?\s*TIME\s*(?:OUT|OF)|,?\s*TIMEOUT|$)`)

	// "ON" cross street split: address ON number+direction
	onCrossPattern1 = regexp.MustCompile(`(?i)^(.+?)\s+ON\s+(\d+\s+(?:NORTH|SOUTH|EAST|WEST|N|S|E|W).*)$`)
	onCrossPattern2 = regexp.MustCompile(`(?i)^(.+?)\s+(?:AND|ON)\s+(\d+\s+\S.*)$`)

	// Apartment/unit suffix
	apartmentPattern = regexp.MustCompile(`(?i)[,.]?\s*(?:APARTMENT|APT|UNIT|SUITE|STE|#)\s*\S*\s*$`)

	// Geocode normalization for Utah grid addresses
	gridAddress      = regexp.MustCompile(`(?i)^(\d+)\s+(NORTH|SOUTH|EAST|WEST|N|S|E|W)\s+(\d+.*)$`)
	gridAddressComma = regexp.MustCompile(`(?i)^(\d+)\s+(NORTH|SOUTH|EAST|WEST|N|S|E|W)\s*,\s*(\d+.*)$`)
	commaAfterNumber = regexp.MustCompile(`(?i)^(\d+)\s*,\s+(\D.*)$`)
	geocodeCross     = regexp.MustCompile(`(?i)^(.+?)\s*,\s*\d+\s+(?:NORTH|SOUTH|EAST|WEST|N|S|E|W)\s*$`)

	// Trailing punctuation
	trailingPunct = regexp.MustCompile(`[.,]+$`)

	// Timestamp patterns for dedup comparison
	timestampSuffix1 = regexp.MustCompile(`(?i)\.?\s*TIME\s*(?:OUT|OF)\s*\d{2}:?\d{2}\.?\s*$`)
	timestampSuffix2 = regexp.MustCompile(`(?i)\.?\s*TIMEOUT\s*\d{2}:?\d{2}\.?\s*$`)

	// Commas inside numbers: "12,000" -> "12000"
	commaInNumber = regexp.MustCompile(`(\d),(\d)`)
)

// dedup removes repeated dispatcher messages from a transcript
// Dispatchers typically say the message twice back-to-back
func dedup(transcript string) string {
	text := strings.TrimSpace(transcript)
	length := len(text)
	if length < 20 {
		return text
	}

	mid := length / 2
	start := int(math.Floor(float64(mid))) - 20
	end := int(math.Ceil(float64(mid))) + 20

	if start < 0 {
		start = 0
	}

	for i := start; i <= end && i < length; i++ {
		if text[i] != '.' && text[i] != ',' {
			continue
		}
		first := strings.TrimSpace(text[:i+1])
		second := strings.TrimSpace(text[i+1:])

		// Remove trailing timestamps from second half for comparison
		secondClean := timestampSuffix1.ReplaceAllString(second, "")
		secondClean = timestampSuffix2.ReplaceAllString(secondClean, "")
		secondClean = strings.TrimSpace(secondClean)

		if len(first) > 0 && len(secondClean) > 0 {
			if normalizeForCompare(first) == normalizeForCompare(secondClean) {
				return first
			}
		}
	}

	return text
}

// normalizeForCompare collapses whitespace, removes trailing punctuation, uppercases
func normalizeForCompare(s string) string {
	s = strings.ToUpper(s)
	s = trailingPunct.ReplaceAllString(s, "")
	fields := strings.Fields(s)
	return strings.Join(fields, " ")
}

// stripApartment removes apartment/unit suffixes from an address
func stripApartment(address string) string {
	return strings.TrimSpace(apartmentPattern.ReplaceAllString(address, ""))
}

// splitOnCross splits an address at "ON" cross street boundaries
// Returns the address and optional cross street
func splitOnCross(address string) (string, string) {
	if m := onCrossPattern1.FindStringSubmatch(address); m != nil {
		return strings.TrimSpace(m[1]), strings.TrimSpace(m[2])
	}
	if m := onCrossPattern2.FindStringSubmatch(address); m != nil {
		return strings.TrimSpace(m[1]), strings.TrimSpace(m[2])
	}
	return address, ""
}

// buildGeocodeQuery normalizes an address for Nominatim geocoding
// Handles Utah grid address conventions
func buildGeocodeQuery(address string) string {
	//* Keep the first grid direction: dropping it turns "805 SOUTH 300 WEST"
	//* into the ambiguous "805 300 WEST"
	if m := gridAddress.FindStringSubmatch(address); m != nil {
		return m[1] + " " + m[2] + " " + m[3]
	}
	if m := gridAddressComma.FindStringSubmatch(address); m != nil {
		return m[1] + " " + m[2] + " " + m[3]
	}

	if m := geocodeCross.FindStringSubmatch(address); m != nil {
		address = m[1]
	}

	if m := commaAfterNumber.FindStringSubmatch(address); m != nil {
		return m[1] + " " + m[2]
	}

	return address
}

// ParseAddress extracts address information from a dispatch transcript
func ParseAddress(transcript string) *models.ParsedAddress {
	if transcript == "" {
		return nil
	}

	single := dedup(transcript)
	// Strip commas inside numbers but preserve structural punctuation
	normalized := strings.ToUpper(commaInNumber.ReplaceAllString(single, "${1}${2}"))
	upper := strings.ToUpper(single)

	var address string
	var originalAddress string
	var raw string
	var city string
	var incidentType string
	var dispatchCode string
	var near string

	// Helper: run pattern on both normalized and original, return match + original address
	type extractResult struct {
		match       []string
		origAddress string
	}
	extractAddress := func(pattern *regexp.Regexp, addrGroup int) *extractResult {
		normMatch := pattern.FindStringSubmatch(normalized)
		if normMatch == nil {
			return nil
		}
		origMatch := pattern.FindStringSubmatch(upper)
		origAddr := ""
		if origMatch != nil && len(origMatch) > addrGroup {
			origAddr = strings.TrimSpace(origMatch[addrGroup])
		}
		if origAddr == "" && len(normMatch) > addrGroup {
			origAddr = strings.TrimSpace(normMatch[addrGroup])
		}
		return &extractResult{match: normMatch, origAddress: origAddr}
	}

	// Try Pattern A/C: RESPOND TO [code] [incident] AT [address] [IN city]
	if result := extractAddress(respondToAt, 3); result != nil {
		m := result.match
		dispatchCode = strings.TrimSpace(m[1])
		incidentType = strings.TrimSpace(m[2])
		address = strings.TrimSpace(m[3])
		originalAddress = result.origAddress
		city = strings.TrimSpace(m[4])
		raw = m[0]
	}

	// Try Pattern B: PRIORITY N, ADDRESS
	if address == "" {
		if result := extractAddress(priorityAddr, 1); result != nil {
			address = strings.TrimSpace(result.match[1])
			originalAddress = result.origAddress
			raw = result.match[0]

			if incMatch := priorityIncident.FindStringSubmatch(normalized); incMatch != nil {
				incidentType = strings.TrimSpace(incMatch[1])
			}
		}
	}

	// Try Pattern D: INCIDENT, ADDRESS
	if address == "" {
		if result := extractAddress(commaIncidentAddr, 2); result != nil {
			incidentType = strings.TrimSpace(result.match[1])
			address = strings.TrimSpace(result.match[2])
			originalAddress = result.origAddress
			raw = result.match[0]
		}
	}

	// Try Pattern D2: INCIDENT, FREEWAY ADDRESS (no house number)
	if address == "" {
		if result := extractAddress(commaIncidentFreeway, 2); result != nil {
			incidentType = strings.TrimSpace(result.match[1])
			address = strings.TrimSpace(result.match[2])
			originalAddress = result.origAddress
			raw = result.match[0]
		}
	}

	// Try Pattern E: INCIDENT ADDRESS (no commas)
	if address == "" {
		if result := extractAddress(incidentAddrNoComma, 2); result != nil {
			incidentType = strings.TrimSpace(result.match[1])
			address = strings.TrimSpace(result.match[2])
			originalAddress = result.origAddress
			raw = result.match[0]
		}
	}

	if address == "" {
		return nil
	}

	// Strip apartment suffixes
	address = stripApartment(address)

	// Split "ON" cross streets
	address, cross := splitOnCross(address)
	if cross != "" {
		near = cross
	}

	// Extract NEAR cross street from full transcript
	if near == "" {
		if nearMatch := nearPattern.FindStringSubmatch(normalized); nearMatch != nil {
			near = strings.TrimSpace(nearMatch[1])
		}
	}

	// Clean up trailing punctuation
	address = strings.TrimSpace(trailingPunct.ReplaceAllString(address, ""))
	if near != "" {
		near = strings.TrimSpace(trailingPunct.ReplaceAllString(near, ""))
	}
	if incidentType != "" {
		incidentType = strings.TrimSpace(trailingPunct.ReplaceAllString(incidentType, ""))
	}

	if originalAddress == "" {
		originalAddress = address
	}

	return &models.ParsedAddress{
		Address:         address,
		OriginalAddress: originalAddress,
		GeocodeQuery:    buildGeocodeQuery(address),
		City:            city,
		Near:            near,
		IncidentType:    incidentType,
		DispatchCode:    dispatchCode,
		Raw:             raw,
	}
}
