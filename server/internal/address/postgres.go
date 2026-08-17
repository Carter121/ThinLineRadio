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
	"database/sql"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"rdio-scanner/server/internal/models"
)

//* PostgresGeocoder resolves parsed dispatch addresses against the UGRC
//* address_points table (loaded by scripts/import-address-points.sh).
type PostgresGeocoder struct {
	db *sql.DB
}

func NewPostgresGeocoder(db *sql.DB) *PostgresGeocoder {
	return &PostgresGeocoder{db: db}
}

//* Directions as spoken in transcripts mapped to UGRC single letters
var directionWords = map[string]string{
	"N": "N", "NORTH": "N",
	"S": "S", "SOUTH": "S",
	"E": "E", "EAST": "E",
	"W": "W", "WEST": "W",
}

//* Spoken street types mapped to UGRC/USPS abbreviations
var streetTypeWords = map[string]string{
	"STREET": "ST", "ST": "ST",
	"AVENUE": "AVE", "AVE": "AVE",
	"DRIVE": "DR", "DR": "DR",
	"LANE": "LN", "LN": "LN",
	"ROAD": "RD", "RD": "RD",
	"CIRCLE": "CIR", "CIR": "CIR",
	"COURT": "CT", "CT": "CT",
	"PLACE": "PL", "PL": "PL",
	"BOULEVARD": "BLVD", "BLVD": "BLVD",
	"PARKWAY": "PKWY", "PKWY": "PKWY",
	"TRAIL": "TRL", "TRL": "TRL",
	"TERRACE": "TER", "TER": "TER",
	"HIGHWAY": "HWY", "HWY": "HWY",
	"COVE": "CV", "CV": "CV",
	"SQUARE": "SQ", "SQ": "SQ",
	"ALLEY": "ALY", "ALY": "ALY",
	"CROSSING": "XING", "XING": "XING",
	"CANYON": "CYN", "CYN": "CYN",
	"EXPRESSWAY": "EXPY", "EXPY": "EXPY",
	"FREEWAY": "FWY", "FWY": "FWY",
	"LOOP": "LOOP", "WAY": "WAY", "ROW": "ROW", "RUN": "RUN",
	"BAY": "BAY", "BEND": "BND", "PARK": "PARK", "PLAZA": "PLZ",
	"POINT": "PT", "RIDGE": "RDG", "GROVE": "GRV", "HOLLOW": "HOLW",
	"JUNCTION": "JCT", "MEADOW": "MDW", "VIEW": "VW", "WALK": "WALK",
}

//* FIPS codes to county names (Utah)
var utahCountyNames = map[string]string{
	"49001": "Beaver", "49003": "Box Elder", "49005": "Cache", "49007": "Carbon",
	"49009": "Daggett", "49011": "Davis", "49013": "Duchesne", "49015": "Emery",
	"49017": "Garfield", "49019": "Grand", "49021": "Iron", "49023": "Juab",
	"49025": "Kane", "49027": "Millard", "49029": "Morgan", "49031": "Piute",
	"49033": "Rich", "49035": "Salt Lake", "49037": "San Juan", "49039": "Sanpete",
	"49041": "Sevier", "49043": "Summit", "49045": "Tooele", "49047": "Uintah",
	"49049": "Utah", "49051": "Wasatch", "49053": "Washington", "49055": "Wayne",
	"49057": "Weber",
}

//* CountyName returns the display name ("Salt Lake County") for a Utah FIPS
//* code, or "" when unknown
func CountyName(fips string) string {
	if name := utahCountyNames[fips]; name != "" {
		return name + " County"
	}
	return ""
}

var nonAddressChars = regexp.MustCompile(`[^A-Z0-9\- ]`)
var houseNumberPattern = regexp.MustCompile(`^\d+$`)

//* Max distance between the dispatched and matched house number (one grid
//* block is 100), and max street extent for a street-level centroid match
const maxHouseNumberDistance = 150
const maxStreetSpanDegrees = 0.02

//* queryParts is a transcript address broken into UGRC column values
type queryParts struct {
	AddNum     string
	AddNumInt  int
	PrefixDir  string
	StreetName string
	StreetType string
	SuffixDir  string
}

//* streetDescriptor splits tokens like "SOUTH HIGHLAND DRIVE" into UGRC
//* direction, name, and type. Used for both address tails and intersections.
func streetDescriptor(tokens []string) (prefixDir, name, streetType, suffixDir string) {
	if len(tokens) == 0 {
		return
	}
	if dir, ok := directionWords[tokens[0]]; ok && len(tokens) > 1 {
		prefixDir = dir
		tokens = tokens[1:]
	}

	//* Trim spoken junk after the last street-type or direction word
	//* ("HIGHLAND DRIVE RESPOND TO FIRE 2"). Never trim at the first token,
	//* so names like "SOUTH TEMPLE" survive.
	last := -1
	isDir := false
	for i := 1; i < len(tokens); i++ {
		if _, ok := directionWords[tokens[i]]; ok {
			last, isDir = i, true
		} else if _, ok := streetTypeWords[tokens[i]]; ok {
			last, isDir = i, false
		}
	}
	if last >= 1 {
		if isDir {
			suffixDir = directionWords[tokens[last]]
		} else {
			streetType = streetTypeWords[tokens[last]]
		}
		tokens = tokens[:last]
	}

	name = strings.Join(tokens, " ")
	//* A bare street-type or direction word is not a street name
	if len(tokens) == 1 {
		if _, ok := streetTypeWords[name]; ok {
			name = ""
		} else if _, ok := directionWords[name]; ok {
			name = ""
		}
	}
	return
}

//* Freeway-style names get no street-level centroid: a pin at the middle of
//* an interstate segment is usually miles from the incident
var highwayName = regexp.MustCompile(`\b(I-?\d+|SR-?\d+|US-?\d+|HIGHWAY|RAMP|EASTBOUND|WESTBOUND|NORTHBOUND|SOUTHBOUND)\b`)

//* splitAddress breaks "12093 SOUTH ALPINE TRAIL DRIVE" or "4620 S 4800 W"
//* into UGRC-style components. Returns nil when there is no house number.
func splitAddress(addr string) *queryParts {
	cleaned := nonAddressChars.ReplaceAllString(strings.ToUpper(addr), " ")
	tokens := strings.Fields(cleaned)
	if len(tokens) < 2 || !houseNumberPattern.MatchString(tokens[0]) {
		return nil
	}

	parts := &queryParts{AddNum: tokens[0]}
	parts.AddNumInt, _ = strconv.Atoi(tokens[0])
	parts.PrefixDir, parts.StreetName, parts.StreetType, parts.SuffixDir = streetDescriptor(tokens[1:])
	if parts.StreetName == "" {
		return nil
	}
	return parts
}

//* candidate is one address_points row plus its match ranking values
type candidate struct {
	FullAdd   string
	AddNum    string
	Street    string
	City      string
	ZipCode   sql.NullString
	CountyID  sql.NullString
	PrefixDir string
	SuffixDir string
	Lat       float64
	Lon       float64
	Score     int
	Sim       float64
	NumDist   int
}

const candidateColumns = `coalesce(full_add,''), coalesce(add_num,''), coalesce(street_name,''), coalesce(city,''), zip_code, county_id, coalesce(prefix_dir,''), coalesce(suffix_dir,''), lat, lon`

//* countyFilter is the hard county restriction: when a county hint exists,
//* candidates outside it are excluded entirely, never just outscored. A
//* confident match 60 miles away is worse than an honest miss.
func countyFilter(hintPlaceholder string) string {
	return fmt.Sprintf(`(%s = '' OR coalesce(county_id,'') = %s)`, hintPlaceholder, hintPlaceholder)
}

//* dirsConsistent reports whether a candidate row agrees with the spoken
//* directions. Only enforced when the spoken address carries BOTH a prefix
//* and a suffix direction (the grid-address signature, e.g. "1300 S 900 W"),
//* since that is where transpositions land a pin across the valley.
//* Empty row values are treated as consistent.
func dirsConsistent(c *candidate, parts *queryParts) bool {
	if parts.PrefixDir == "" || parts.SuffixDir == "" {
		return true
	}
	if c.PrefixDir != "" && c.PrefixDir != parts.PrefixDir {
		return false
	}
	if c.SuffixDir != "" && c.SuffixDir != parts.SuffixDir {
		return false
	}
	return true
}

//* splitByDirs partitions candidates into direction-consistent rows and the
//* rest, preserving each stage's ranking order
func splitByDirs(rows []*candidate, parts *queryParts) (consistent, mismatched []*candidate) {
	for _, c := range rows {
		if dirsConsistent(c, parts) {
			consistent = append(consistent, c)
		} else {
			mismatched = append(mismatched, c)
		}
	}
	return
}

//* scoreExpr ranks candidates by how many optional components agree.
//* Placeholder order: prefix_dir, suffix_dir, street_type, city, county hint.
//* The county term only matters for unhinted lookups now that a hint is a
//* hard WHERE filter; it stays for callers with no hint configured.
func scoreExpr(p1, p2, p3, p4, p5 string) string {
	return fmt.Sprintf(`(coalesce(prefix_dir,'') = %s AND %s <> '')::int * 2
		+ (coalesce(suffix_dir,'') = %s AND %s <> '')::int * 2
		+ (coalesce(street_type,'') = %s AND %s <> '')::int
		+ (coalesce(city,'') = %s AND %s <> '')::int * 3
		+ (coalesce(county_id,'') = %s AND %s <> '')::int * 10`,
		p1, p1, p2, p2, p3, p3, p4, p4, p5, p5)
}

//* Lookup resolves a parsed dispatch address to coordinates.
//* Returns (nil, nil) when no acceptable match exists.
func (g *PostgresGeocoder) Lookup(parsed *models.ParsedAddress) (*models.AddressMatch, error) {
	if g == nil || g.db == nil || parsed == nil {
		return nil, nil
	}

	city := strings.TrimSpace(strings.ToUpper(parsed.City))
	hint := strings.TrimSpace(parsed.CountyHint)
	parts := splitAddress(parsed.Address)
	if parts == nil {
		return g.lookupIntersection(parsed.Address, city, hint)
	}

	//* Cross street ("... ON 1700 WEST") disambiguates same-number matches in
	//* different cities
	nearStreet := ""
	if parsed.Near != "" {
		cleaned := nonAddressChars.ReplaceAllString(strings.ToUpper(parsed.Near), " ")
		if _, name, _, _ := streetDescriptor(strings.Fields(cleaned)); name != "" {
			resolved, _, err := g.resolveStreetName(name, hint)
			if err != nil {
				return nil, err
			}
			nearStreet = resolved
		}
	}

	//* Best direction-mismatched candidate seen so far. Returned as an honest
	//* "uncertain" match only when every stage misses; earlier stages stash
	//* first so the highest-quality guess wins.
	var stash *candidate
	keep := func(c *candidate) {
		if stash == nil && c != nil {
			stash = c
		}
	}

	//* Stage 1: exact house number + exact street name, best component score wins
	rows, err := g.queryCandidates(`
		SELECT `+candidateColumns+`, `+scoreExpr("$3", "$4", "$5", "$6", "$7")+` AS score, 1.0 AS sim, 0 AS numdist
		FROM address_points
		WHERE add_num = $1 AND street_name = $2 AND `+countyFilter("$7")+`
		ORDER BY score DESC LIMIT 5`,
		parts.AddNum, parts.StreetName, parts.PrefixDir, parts.SuffixDir, parts.StreetType, city, hint)
	if err != nil {
		return nil, err
	}
	consistent, mismatched := splitByDirs(rows, parts)
	if row := g.pickBest(consistent, nearStreet); row != nil {
		return toMatch(row, "rooftop"), nil
	}
	keep(g.pickBest(mismatched, nearStreet))

	//* Stage 2: exact house number + fuzzy street name (Whisper misspellings)
	row, err := g.queryOne(`
		SELECT `+candidateColumns+`, `+scoreExpr("$3", "$4", "$5", "$6", "$7")+` AS score,
			similarity(street_name, $2) AS sim, 0 AS numdist
		FROM address_points
		WHERE add_num = $1 AND similarity(street_name, $2) >= 0.4 AND `+countyFilter("$7")+`
		ORDER BY sim DESC, score DESC LIMIT 1`,
		parts.AddNum, parts.StreetName, parts.PrefixDir, parts.SuffixDir, parts.StreetType, city, hint)
	if err != nil {
		return nil, err
	}
	if row != nil {
		if dirsConsistent(row, parts) {
			return toMatch(row, "rooftop"), nil
		}
		keep(row)
	}

	//* Resolve the street name the dataset actually uses (exact, else fuzzy)
	street, streetSim, err := g.resolveStreetName(parts.StreetName, hint)
	if err != nil {
		return nil, err
	}

	//* Stage 3: known street, nearest existing house number (dispatched
	//* addresses often do not exist as exact points)
	if street != "" && parts.AddNumInt > 0 {
		rows, err = g.queryCandidates(`
			SELECT `+candidateColumns+`, `+scoreExpr("$3", "$4", "$5", "$6", "$7")+` AS score, 1.0 AS sim,
				abs(add_num_int - $1) AS numdist
			FROM address_points
			WHERE street_name = $2 AND add_num_int IS NOT NULL AND abs(add_num_int - $1) <= `+strconv.Itoa(maxHouseNumberDistance)+`
				AND `+countyFilter("$7")+`
			ORDER BY numdist ASC, score DESC LIMIT 5`,
			parts.AddNumInt, street, parts.PrefixDir, parts.SuffixDir, parts.StreetType, city, hint)
		if err != nil {
			return nil, err
		}
		consistent, mismatched = splitByDirs(rows, parts)
		if row := g.pickBest(consistent, nearStreet); row != nil {
			return toMatch(row, "nearby"), nil
		}
		keep(g.pickBest(mismatched, nearStreet))
	}

	//* Stage 4: trigram match on the full normalized address line
	normalized := parts.AddNum + " "
	if parts.PrefixDir != "" {
		normalized += parts.PrefixDir + " "
	}
	normalized += parts.StreetName
	if parts.StreetType != "" {
		normalized += " " + parts.StreetType
	}
	if parts.SuffixDir != "" {
		normalized += " " + parts.SuffixDir
	}
	row, err = g.queryOne(`
		SELECT `+candidateColumns+`,
			(coalesce(city,'') = $2 AND $2 <> '')::int AS score,
			similarity(full_add, $1) AS sim, 0 AS numdist
		FROM address_points
		WHERE full_add % $1 AND similarity(full_add, $1) >= 0.55 AND `+countyFilter("$3")+`
		ORDER BY sim DESC, score DESC LIMIT 1`,
		normalized, city, hint)
	if err != nil {
		return nil, err
	}
	if row != nil {
		if dirsConsistent(row, parts) {
			return toMatch(row, "rooftop"), nil
		}
		keep(row)
	}

	//* Stage 5: street-level fallback, the point nearest the street centroid.
	//* Only for confident street names with an unambiguously small extent.
	//* With a county hint, only the county-restricted street is considered:
	//* never fall back to a statewide centroid for a hinted call.
	if street != "" && streetSim >= 0.65 && !highwayName.MatchString(street) && !highwayName.MatchString(parts.StreetName) {
		counties := []string{""}
		if hint != "" {
			counties = []string{hint}
		}
		for _, county := range counties {
			row, err = g.queryOne(`
				WITH pts AS (
					SELECT * FROM address_points WHERE street_name = $1
						AND ($6 = '' OR coalesce(county_id,'') = $6)
				), agg AS (
					SELECT avg(lat) AS clat, avg(lon) AS clon,
						max(lat) - min(lat) AS dlat, max(lon) - min(lon) AS dlon
					FROM pts
				)
				SELECT `+candidateColumns+`, `+scoreExpr("$2", "$3", "$4", "$5", "$7")+` AS score, 1.0 AS sim, 0 AS numdist
				FROM pts, agg
				WHERE agg.dlat <= `+fmt.Sprintf("%f", maxStreetSpanDegrees)+` AND agg.dlon <= `+fmt.Sprintf("%f", maxStreetSpanDegrees*1.3)+`
				ORDER BY score DESC, abs(lat - agg.clat) + abs(lon - agg.clon) ASC LIMIT 1`,
				street, parts.PrefixDir, parts.SuffixDir, parts.StreetType, city, county, hint)
			if err != nil {
				return nil, err
			}
			if row != nil {
				return toMatch(row, "street"), nil
			}
		}
	}

	//* Nothing matched cleanly. A stashed direction-mismatched row is returned
	//* as an honest guess rather than a confident wrong pin.
	if stash != nil {
		return toMatch(stash, "uncertain"), nil
	}

	return nil, nil
}

//* lookupIntersection resolves "STREET A AND STREET B" to the closest pair of
//* address points on the two streets, pinning their midpoint.
func (g *PostgresGeocoder) lookupIntersection(addr, city, hint string) (*models.AddressMatch, error) {
	cleaned := nonAddressChars.ReplaceAllString(strings.ToUpper(addr), " ")
	sides := regexp.MustCompile(`\s+AND\s+`).Split(cleaned, 2)
	if len(sides) != 2 {
		return nil, nil
	}

	_, nameA, _, _ := streetDescriptor(strings.Fields(sides[0]))
	_, nameB, _, _ := streetDescriptor(strings.Fields(sides[1]))
	if nameA == "" || nameB == "" || nameA == nameB {
		return nil, nil
	}

	streetA, _, err := g.resolveStreetName(nameA, hint)
	if err != nil {
		return nil, err
	}
	streetB, _, err := g.resolveStreetName(nameB, hint)
	if err != nil {
		return nil, err
	}
	if streetA == "" || streetB == "" {
		return nil, nil
	}

	//* Closest pair within ~1km of each other; midpoint is the intersection.
	//* A county hint hard-restricts both sides.
	var lat, lon float64
	var matchCity, countyID sql.NullString
	err = g.db.QueryRow(`
		SELECT (a.lat + b.lat) / 2, (a.lon + b.lon) / 2, a.city, a.county_id
		FROM address_points a
		JOIN address_points b ON b.street_name = $2
			AND abs(a.lat - b.lat) < 0.01 AND abs(a.lon - b.lon) < 0.013
			AND ($4 = '' OR coalesce(b.county_id,'') = $4)
		WHERE a.street_name = $1 AND ($4 = '' OR coalesce(a.county_id,'') = $4)
		ORDER BY (a.lat - b.lat)^2 + ((a.lon - b.lon) * 0.75)^2 ASC,
			(coalesce(a.city,'') = $3 AND $3 <> '')::int DESC
		LIMIT 1`,
		streetA, streetB, city, hint).Scan(&lat, &lon, &matchCity, &countyID)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("intersection lookup failed: %w", err)
	}

	county := ""
	if countyID.Valid {
		if name := utahCountyNames[countyID.String]; name != "" {
			county = name + " County"
		}
	}
	full := streetA + " & " + streetB
	if matchCity.Valid && matchCity.String != "" {
		full += ", " + matchCity.String
	}
	full += ", UT"

	return &models.AddressMatch{
		FullAddress: full,
		Lat:         lat,
		Lon:         lon,
		Road:        streetA,
		City:        matchCity.String,
		County:      county,
		State:       "Utah",
		Precision:   "intersection",
	}, nil
}

//* resolveStreetName returns the dataset's spelling of a street name and its
//* similarity: the name itself when it exists (1.0), else the most similar
//* name above 0.45. A county hint restricts resolution to that county, so a
//* spelling that only exists elsewhere cannot hijack the later stages.
func (g *PostgresGeocoder) resolveStreetName(name, countyHint string) (string, float64, error) {
	if name == "" {
		return "", 0, nil
	}
	var resolved string
	var sim float64
	err := g.db.QueryRow(`
		SELECT street_name, similarity(street_name, $1) FROM address_points
		WHERE street_name % $1 AND similarity(street_name, $1) >= 0.45
			AND ($2 = '' OR coalesce(county_id,'') = $2)
		GROUP BY street_name
		ORDER BY (street_name = $1)::int DESC, similarity(street_name, $1) DESC, count(*) DESC
		LIMIT 1`, name, countyHint).Scan(&resolved, &sim)
	if err == sql.ErrNoRows {
		return "", 0, nil
	}
	if err != nil {
		return "", 0, fmt.Errorf("street name resolution failed: %w", err)
	}
	if resolved == name {
		sim = 1.0
	}
	return resolved, sim, nil
}

//* queryCandidates runs a stage query returning up to a handful of ranked rows
func (g *PostgresGeocoder) queryCandidates(query string, args ...any) ([]*candidate, error) {
	rows, err := g.db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("address lookup query failed: %w", err)
	}
	defer rows.Close()

	var out []*candidate
	for rows.Next() {
		c := &candidate{}
		if err := rows.Scan(&c.FullAdd, &c.AddNum, &c.Street, &c.City,
			&c.ZipCode, &c.CountyID, &c.PrefixDir, &c.SuffixDir, &c.Lat, &c.Lon, &c.Score, &c.Sim, &c.NumDist); err != nil {
			return nil, fmt.Errorf("address lookup scan failed: %w", err)
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

//* pickBest returns the top candidate, preferring the one closest to the
//* dispatched cross street when one was heard ("... ON 1700 WEST")
func (g *PostgresGeocoder) pickBest(rows []*candidate, nearStreet string) *candidate {
	if len(rows) == 0 {
		return nil
	}
	if len(rows) == 1 || nearStreet == "" {
		return rows[0]
	}

	best := rows[0]
	bestDist := -1.0
	for _, c := range rows {
		var dist sql.NullFloat64
		err := g.db.QueryRow(`
			SELECT min(abs(lat - $1) + abs(lon - $2)) FROM address_points
			WHERE street_name = $3`, c.Lat, c.Lon, nearStreet).Scan(&dist)
		if err != nil || !dist.Valid {
			continue
		}
		//* Only trust the cross street within about 2 km
		if dist.Float64 <= 0.02 && (bestDist < 0 || dist.Float64 < bestDist) {
			best = c
			bestDist = dist.Float64
		}
	}
	return best
}

func (g *PostgresGeocoder) queryOne(query string, args ...any) (*candidate, error) {
	c := &candidate{}
	err := g.db.QueryRow(query, args...).Scan(&c.FullAdd, &c.AddNum, &c.Street, &c.City,
		&c.ZipCode, &c.CountyID, &c.PrefixDir, &c.SuffixDir, &c.Lat, &c.Lon, &c.Score, &c.Sim, &c.NumDist)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("address lookup query failed: %w", err)
	}
	return c, nil
}

func toMatch(c *candidate, precision string) *models.AddressMatch {
	county := ""
	if c.CountyID.Valid {
		if name := utahCountyNames[c.CountyID.String]; name != "" {
			county = name + " County"
		}
	}

	full := c.FullAdd
	if c.City != "" {
		full += ", " + c.City
	}
	full += ", UT"
	if c.ZipCode.Valid && c.ZipCode.String != "" {
		full += " " + c.ZipCode.String
	}

	return &models.AddressMatch{
		FullAddress: full,
		Lat:         c.Lat,
		Lon:         c.Lon,
		HouseNumber: c.AddNum,
		Road:        c.Street,
		City:        c.City,
		County:      county,
		State:       "Utah",
		Precision:   precision,
	}
}
