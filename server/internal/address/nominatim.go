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
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"rdio-scanner/server/internal/models"
)

// NominatimClient handles geocoding requests to a Nominatim server
type NominatimClient struct {
	baseURL    string
	httpClient *http.Client
}

type nominatimResult struct {
	Lat         string         `json:"lat"`
	Lon         string         `json:"lon"`
	DisplayName string         `json:"display_name"`
	Address     *nominatimAddr `json:"address,omitempty"`
}

type nominatimAddr struct {
	HouseNumber string `json:"house_number,omitempty"`
	Road        string `json:"road,omitempty"`
	City        string `json:"city,omitempty"`
	Town        string `json:"town,omitempty"`
	Village     string `json:"village,omitempty"`
	County      string `json:"county,omitempty"`
	State       string `json:"state,omitempty"`
}

// NewNominatimClient creates a new Nominatim geocoding client
func NewNominatimClient(baseURL string) *NominatimClient {
	return &NominatimClient{
		baseURL: strings.TrimRight(baseURL, "/"),
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// Lookup geocodes a parsed address using Nominatim
func (n *NominatimClient) Lookup(parsed *models.ParsedAddress) (*models.AddressMatch, error) {
	//* Default to Salt Lake County unless the call carries a county hint
	county := "Salt Lake County"
	if name := utahCountyNames[parsed.CountyHint]; name != "" {
		county = name + " County"
	}

	params := url.Values{
		"format":         {"jsonv2"},
		"addressdetails": {"1"},
		"countrycodes":   {"us"},
		"limit":          {"5"},
		"county":         {county},
		"state":          {"Utah"},
		"street":         {parsed.GeocodeQuery},
	}

	if parsed.City != "" {
		params.Set("city", parsed.City)
	}

	reqURL := n.baseURL + "/search?" + params.Encode()
	resp, err := n.httpClient.Get(reqURL)
	if err != nil {
		return nil, fmt.Errorf("nominatim request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("nominatim returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read nominatim response: %w", err)
	}

	var results []nominatimResult
	if err := json.Unmarshal(body, &results); err != nil {
		return nil, fmt.Errorf("failed to parse nominatim response: %w", err)
	}

	if len(results) == 0 {
		return nil, nil
	}

	//* Nominatim treats the county param as a soft preference; enforce the
	//* hint here so a hinted call never resolves outside its county
	if parsed.CountyHint != "" {
		if name := utahCountyNames[parsed.CountyHint]; name != "" {
			wanted := name + " County"
			for i := range results {
				addr := results[i].Address
				if addr != nil && addr.County == wanted && addr.State == "Utah" {
					return toAddressMatch(&results[i], parsed.GeocodeQuery), nil
				}
			}
			return nil, nil
		}
	}

	return toAddressMatch(&results[0], parsed.GeocodeQuery), nil
}

func toAddressMatch(result *nominatimResult, geocodeQuery string) *models.AddressMatch {
	lat, _ := strconv.ParseFloat(result.Lat, 64)
	lon, _ := strconv.ParseFloat(result.Lon, 64)

	// Fall back to extracting house number from the geocode query
	houseNumber := ""
	if result.Address != nil {
		houseNumber = result.Address.HouseNumber
	}
	if houseNumber == "" {
		// Extract leading digits from geocode query
		for i, c := range geocodeQuery {
			if c < '0' || c > '9' {
				if i > 0 {
					houseNumber = geocodeQuery[:i]
				}
				break
			}
		}
	}

	var road, city, county, state string
	if result.Address != nil {
		road = result.Address.Road
		city = result.Address.City
		if city == "" {
			city = result.Address.Town
		}
		if city == "" {
			city = result.Address.Village
		}
		county = result.Address.County
		state = result.Address.State
	}

	return &models.AddressMatch{
		FullAddress: result.DisplayName,
		Lat:         lat,
		Lon:         lon,
		HouseNumber: houseNumber,
		Road:        road,
		City:        city,
		County:      county,
		State:       state,
	}
}
