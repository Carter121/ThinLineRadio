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
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func newTestController() *Controller {
	return &Controller{
		Options: NewOptions(),
		Logs:    NewLogs(),
	}
}

func TestSendNtfy_NoTopic(t *testing.T) {
	c := newTestController()
	if c.sendNtfy("title", "body", 3, nil, "") {
		t.Error("expected false when NtfyTopic is empty")
	}
}

func TestSendNtfy_Success(t *testing.T) {
	var gotTitle, gotPriority, gotTags, gotBody, gotAuth string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotTitle = r.Header.Get("Title")
		gotPriority = r.Header.Get("Priority")
		gotTags = r.Header.Get("Tags")
		gotAuth = r.Header.Get("Authorization")
		b, _ := io.ReadAll(r.Body)
		gotBody = string(b)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := newTestController()
	c.Options.NtfyServer = srv.URL
	c.Options.NtfyTopic = "test-topic"
	c.Options.NtfyToken = "tok123"

	ok := c.sendNtfy("BATTALION 3", "RESPOND TO FIRE", 3, []string{"fire_engine"}, "")
	if !ok {
		t.Fatal("expected sendNtfy to return true")
	}

	if gotTitle != "BATTALION 3" {
		t.Errorf("title = %q, want %q", gotTitle, "BATTALION 3")
	}
	if gotPriority != "3" {
		t.Errorf("priority = %q, want %q", gotPriority, "3")
	}
	if gotTags != "fire_engine" {
		t.Errorf("tags = %q, want %q", gotTags, "fire_engine")
	}
	if gotBody != "RESPOND TO FIRE" {
		t.Errorf("body = %q, want %q", gotBody, "RESPOND TO FIRE")
	}
	if gotAuth != "Bearer tok123" {
		t.Errorf("auth = %q, want %q", gotAuth, "Bearer tok123")
	}
}

func TestSendNtfy_NoToken(t *testing.T) {
	var gotAuth string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := newTestController()
	c.Options.NtfyServer = srv.URL
	c.Options.NtfyTopic = "test-topic"

	ok := c.sendNtfy("title", "body", 4, nil, "")
	if !ok {
		t.Fatal("expected sendNtfy to return true")
	}
	if gotAuth != "" {
		t.Errorf("expected no Authorization header, got %q", gotAuth)
	}
}

func TestSendNtfy_ClickUrl(t *testing.T) {
	var gotClick, gotActions string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotClick = r.Header.Get("Click")
		gotActions = r.Header.Get("Actions")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := newTestController()
	c.Options.NtfyServer = srv.URL
	c.Options.NtfyTopic = "test-topic"

	if !c.sendNtfy("title", "body", 3, nil, "https://tlr.example.com/alert/42") {
		t.Fatal("expected sendNtfy to return true")
	}
	if gotClick != "https://tlr.example.com/alert/42" {
		t.Errorf("click = %q, want %q", gotClick, "https://tlr.example.com/alert/42")
	}
	if gotActions != "view, View, https://tlr.example.com/alert/42" {
		t.Errorf("actions = %q, want %q", gotActions, "view, View, https://tlr.example.com/alert/42")
	}
}

func TestSendNtfy_NoClickUrl(t *testing.T) {
	var gotClick, gotActions string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotClick = r.Header.Get("Click")
		gotActions = r.Header.Get("Actions")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := newTestController()
	c.Options.NtfyServer = srv.URL
	c.Options.NtfyTopic = "test-topic"

	if !c.sendNtfy("title", "body", 3, nil, "") {
		t.Fatal("expected sendNtfy to return true")
	}
	if gotClick != "" || gotActions != "" {
		t.Errorf("expected no Click/Actions headers, got click=%q actions=%q", gotClick, gotActions)
	}
}

func TestSendNtfy_ServerError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	c := newTestController()
	c.Options.NtfyServer = srv.URL
	c.Options.NtfyTopic = "test-topic"

	if c.sendNtfy("title", "body", 3, nil, "") {
		t.Error("expected false on server error")
	}
}

func TestSendNtfy_TopicInURL(t *testing.T) {
	var gotPath string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := newTestController()
	c.Options.NtfyServer = srv.URL
	c.Options.NtfyTopic = "my-topic"

	c.sendNtfy("title", "body", 3, nil, "")
	if gotPath != "/my-topic" {
		t.Errorf("path = %q, want %q", gotPath, "/my-topic")
	}
}
