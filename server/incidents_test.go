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
	"testing"
)

func TestNormalizeIncidentAddress(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{"1300 SOUTH 900 WEST", "1300 S 900 W"},
		{"1300 S 900 W", "1300 S 900 W"},
		{"  2150   West 6200 SOUTH. ", "2150 W 6200 S"},
		{"805 SOUTH CHEYENNE STREET", "805 S CHEYENNE STREET"},
		{"", ""},
	}
	for _, tt := range tests {
		if got := normalizeIncidentAddress(tt.in); got != tt.want {
			t.Errorf("normalizeIncidentAddress(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestHaversineMeters(t *testing.T) {
	//* Same point
	if d := haversineMeters(40.76, -111.89, 40.76, -111.89); d != 0 {
		t.Errorf("same point distance = %f, want 0", d)
	}
	//* ~111 m per 0.001 degree of latitude
	d := haversineMeters(40.76, -111.89, 40.761, -111.89)
	if d < 100 || d > 125 {
		t.Errorf("0.001 deg lat distance = %f, want ~111", d)
	}
	//* One SLC grid block (~200 m) must NOT cluster
	d = haversineMeters(40.76, -111.89, 40.762, -111.89)
	if d <= incidentClusterRadiusMeters {
		t.Errorf("two blocks apart (%f m) should exceed cluster radius", d)
	}
}

func TestMatchIncident(t *testing.T) {
	point := func(lat, lon float64) sql.NullFloat64 {
		_ = lon
		return sql.NullFloat64{Float64: lat, Valid: true}
	}
	incA := &incidentRow{Id: 1, Lat: point(40.7600, 0), Lon: sql.NullFloat64{Float64: -111.8900, Valid: true}, NormalizedAddress: "500 S 700 W"}
	incB := &incidentRow{Id: 2, NormalizedAddress: "2150 W 6200 S"}
	open := []*incidentRow{incA, incB}

	//* Within 100 m of incident A
	if got := matchIncident(open, true, 40.7605, -111.8900, "OTHER ADDR"); got != incA {
		t.Errorf("nearby point should match incident A, got %v", got)
	}
	//* Far away point, but address equality with B
	if got := matchIncident(open, true, 41.0, -112.5, "2150 W 6200 S"); got != incB {
		t.Errorf("address equality should match incident B, got %v", got)
	}
	//* No coordinates, address match only
	if got := matchIncident(open, false, 0, 0, "500 S 700 W"); got != incA {
		t.Errorf("address-only should match incident A, got %v", got)
	}
	//* Nothing matches
	if got := matchIncident(open, true, 41.0, -112.5, "1 N MAIN ST"); got != nil {
		t.Errorf("unrelated call should not match, got %v", got)
	}
}
