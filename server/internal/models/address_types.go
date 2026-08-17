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

package models

// ParsedAddress holds an address extracted from a dispatch transcript
type ParsedAddress struct {
	Address         string        `json:"address"`         // Cleaned address (commas stripped from numbers)
	OriginalAddress string        `json:"originalAddress"` // Address as it appears in the transcript (commas intact)
	GeocodeQuery    string        `json:"geocodeQuery"`
	City            string        `json:"city,omitempty"`
	Near            string        `json:"near,omitempty"`
	IncidentType    string        `json:"incidentType,omitempty"`
	DispatchCode    string        `json:"dispatchCode,omitempty"`
	Raw             string        `json:"raw"`
	//* CountyHint is a Utah county FIPS code the geocoder should prefer,
	//* resolved from the call's talkgroup
	CountyHint string        `json:"countyHint,omitempty"`
	Match      *AddressMatch `json:"match,omitempty"`
}

// AddressMatch holds a geocoded result (UGRC address points or Nominatim)
type AddressMatch struct {
	FullAddress string  `json:"fullAddress"`
	Lat         float64 `json:"lat"`
	Lon         float64 `json:"lon"`
	HouseNumber string  `json:"houseNumber,omitempty"`
	Road        string  `json:"road,omitempty"`
	City        string  `json:"city,omitempty"`
	County      string  `json:"county,omitempty"`
	State       string  `json:"state,omitempty"`
	//* Precision: "rooftop" (exact point), "nearby" (closest house number),
	//* "street" (street centroid), "intersection". Empty for Nominatim results.
	Precision string `json:"precision,omitempty"`
}
