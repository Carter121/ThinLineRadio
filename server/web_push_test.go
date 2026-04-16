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
	"testing"
	"time"
)

// battalionParser is a minimal TranscriptParser shared by battalion detection tests.
var battalionParser = NewTranscriptParser(TranscriptConfig{
	UnitTypes: []FuzzyWord{
		{Word: "BATTALION", MaxDistance: 2},
		{Word: "ENGINE", MaxDistance: 2},
		{Word: "LADDER", MaxDistance: 2},
	},
	UnitPrefixes:  []FuzzyWord{},
	DispatchNames: []FuzzyWord{},
	Corrections:   []FuzzyWord{},
})

// ---------------------------------------------------------------------------
// hasBattalionUnit tests
// ---------------------------------------------------------------------------

func TestHasBattalionUnit(t *testing.T) {
	tests := []struct {
		name       string
		transcript string
		want       bool
	}{
		{
			name:       "battalion dispatched alone",
			transcript: "BATTALION 1 RESPOND TO STRUCTURE FIRE 123 MAIN ST",
			want:       true,
		},
		{
			name:       "battalion with engine",
			transcript: "ENGINE 3 AND BATTALION 2 RESPOND",
			want:       true,
		},
		{
			name:       "no battalion — engine and ladder only",
			transcript: "ENGINE 5 AND LADDER 12 RESPOND",
			want:       false,
		},
		{
			name:       "empty transcript",
			transcript: "",
			want:       false,
		},
		{
			name:       "battalion lowercase — parser uppercases internally",
			transcript: "battalion 1 respond",
			want:       true,
		},
		{
			name:       "nil parser returns false",
			transcript: "BATTALION 1 RESPOND",
			want:       false, // tested separately below via nil parser path
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			parser := battalionParser
			if tt.name == "nil parser returns false" {
				parser = nil
			}
			got := hasBattalionUnit(parser, tt.transcript)
			if got != tt.want {
				t.Errorf("hasBattalionUnit(%q) = %v, want %v", tt.transcript, got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// WebPushSubscriptions store tests (no DB — in-memory only)
// ---------------------------------------------------------------------------

func TestWebPushSubscriptions_AddAndGet(t *testing.T) {
	store := NewWebPushSubscriptions()

	sub := &WebPushSubscription{
		Id:        1,
		UserId:    42,
		Endpoint:  "https://fcm.googleapis.com/test-endpoint-1",
		P256DH:    "dGVzdA==",
		Auth:      "dGVzdA==",
		CreatedAt: time.Now().Unix(),
	}

	store.mutex.Lock()
	store.addInMemory(sub)
	store.mutex.Unlock()

	all := store.GetAll()
	if len(all) != 1 {
		t.Fatalf("expected 1 subscription, got %d", len(all))
	}
	if all[0].Endpoint != sub.Endpoint {
		t.Errorf("endpoint mismatch: got %q, want %q", all[0].Endpoint, sub.Endpoint)
	}
	if all[0].UserId != sub.UserId {
		t.Errorf("userId mismatch: got %d, want %d", all[0].UserId, sub.UserId)
	}
}

func TestWebPushSubscriptions_DeleteByEndpoint(t *testing.T) {
	store := NewWebPushSubscriptions()

	sub := &WebPushSubscription{
		Id:       1,
		UserId:   42,
		Endpoint: "https://example.com/push/abc123",
	}

	store.mutex.Lock()
	store.addInMemory(sub)
	store.mutex.Unlock()

	if err := store.Delete(sub.Endpoint, nil); err != nil {
		t.Fatalf("Delete returned unexpected error: %v", err)
	}

	all := store.GetAll()
	if len(all) != 0 {
		t.Errorf("expected empty store after delete, got %d subscriptions", len(all))
	}
}

func TestWebPushSubscriptions_DeleteNonexistent(t *testing.T) {
	store := NewWebPushSubscriptions()

	// Deleting a missing endpoint should not error or panic.
	if err := store.Delete("https://nonexistent.example.com/push", nil); err != nil {
		t.Errorf("Delete of nonexistent endpoint should not error, got: %v", err)
	}
}

func TestWebPushSubscriptions_MultipleSubscriptions(t *testing.T) {
	store := NewWebPushSubscriptions()

	subs := []*WebPushSubscription{
		{Id: 1, UserId: 1, Endpoint: "https://example.com/push/1"},
		{Id: 2, UserId: 2, Endpoint: "https://example.com/push/2"},
		{Id: 3, UserId: 3, Endpoint: "https://example.com/push/3"},
	}

	store.mutex.Lock()
	for _, s := range subs {
		store.addInMemory(s)
	}
	store.mutex.Unlock()

	all := store.GetAll()
	if len(all) != 3 {
		t.Fatalf("expected 3 subscriptions, got %d", len(all))
	}

	// Delete one and verify count
	if err := store.Delete("https://example.com/push/2", nil); err != nil {
		t.Fatalf("Delete returned unexpected error: %v", err)
	}

	all = store.GetAll()
	if len(all) != 2 {
		t.Errorf("expected 2 subscriptions after delete, got %d", len(all))
	}
}
