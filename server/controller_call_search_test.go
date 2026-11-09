package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func callSearchMessage(t *testing.T, input string) *Message {
	t.Helper()
	message := &Message{}
	if err := message.FromJson([]byte(input)); err != nil {
		t.Fatal(err)
	}
	return message
}

func receiveCallSearchMessage(t *testing.T, client *Client) *Message {
	t.Helper()
	select {
	case message := <-client.Send:
		if len(client.Send) != 0 {
			t.Fatal("request emitted multiple responses")
		}
		return message
	default:
		t.Fatal("missing call-search response")
		return nil
	}
}

func assertCallSearchError(t *testing.T, client *Client, code string) {
	t.Helper()
	message := receiveCallSearchMessage(t, client)
	payload, ok := message.Payload.(map[string]any)
	if !ok || message.Command != MessageCommandError || payload["command"] != MessageCommandListCall || payload["code"] != code {
		t.Fatalf("unidentifiable error: %+v", message)
	}
	text, ok := payload["message"].(string)
	if !ok || text == "" {
		t.Fatal("error message missing")
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	for _, secret := range []string{"SELECT", "calls\"", "database", "password", "sql:"} {
		if strings.Contains(string(encoded), secret) {
			t.Fatalf("internal details in error: %s", encoded)
		}
	}
}

func TestCallSearchHandlerValidation(t *testing.T) {
	//* A nil Calls dependency proves rejected requests cannot reach Search.
	controller := &Controller{}
	client := &Client{Send: make(chan *Message, 4)}
	for _, input := range []string{
		`["LCL",null]`, `["LCL",[]]`, `["LCL","all"]`, `["LCL",{"channels":null}]`,
		`["LCL",{"channels":[{"system":1,"talkgroup":101},{"system":2}]}]`,
	} {
		t.Run(input, func(t *testing.T) {
			if err := controller.ProcessMessageCommandListCall(client, callSearchMessage(t, input)); err != nil {
				t.Fatalf("validation did not finish normally: %v", err)
			}
			assertCallSearchError(t, client, "invalid_filters")
		})
	}
}

func TestCallSearchHandlerRecoveryAndSuccess(t *testing.T) {
	f := newCallSearchFixture(t)
	if err := f.controller.ProcessMessageCommandListCall(f.client, callSearchMessage(t, `["LCL",{"channels":null}]`)); err != nil {
		t.Fatal(err)
	}
	assertCallSearchError(t, f.client, "invalid_filters")
	if err := f.controller.ProcessMessageCommandListCall(f.client, callSearchMessage(t, `["LCL",{"channels":[{"system":2,"talkgroup":101}],"limit":1}]`)); err != nil {
		t.Fatal(err)
	}
	message := receiveCallSearchMessage(t, f.client)
	results, ok := message.Payload.(*CallsSearchResults)
	if message.Command != MessageCommandListCall || !ok {
		t.Fatalf("unexpected success response: %+v", message)
	}
	assertCallSearchResults(t, results, []uint64{3}, true)
	encoded, err := json.Marshal(results)
	if err != nil {
		t.Fatal(err)
	}
	var shape map[string]any
	if err := json.Unmarshal(encoded, &shape); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"count", "hasMore", "dateStart", "dateStop", "options", "results"} {
		if _, present := shape[key]; !present {
			t.Fatalf("existing response field lost: %s", key)
		}
	}
	if err := f.controller.ProcessMessageCommandListCall(f.client, callSearchMessage(t, `["LCL",{"channels":[]}]`)); err != nil {
		t.Fatal(err)
	}
	assertCallSearchResults(t, receiveCallSearchMessage(t, f.client).Payload.(*CallsSearchResults), []uint64{}, false)
}

func TestCallSearchHandlerDatabaseError(t *testing.T) {
	f := newCallSearchFixture(t)
	if _, err := f.controller.Database.Sql.Exec(`DROP TABLE "calls"`); err != nil {
		t.Fatal(err)
	}
	if err := f.controller.ProcessMessageCommandListCall(f.client, callSearchMessage(t, `["LCL",{}]`)); err == nil {
		t.Fatal("search failure no longer reaches server logging")
	}
	assertCallSearchError(t, f.client, "search_failed")
}
