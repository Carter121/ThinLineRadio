package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"rdio-scanner/server/internal/models"
)

func TestIncidentPath(t *testing.T) {
	for _, tc := range []struct {
		path             string
		id               uint64
		members, invalid bool
	}{
		{"/api/incidents", 0, false, false}, {"/api/incidents/12", 12, false, false}, {"/api/incidents/12/calls", 12, true, false},
		{"/api/incidents/0", 0, false, true}, {"/api/incidents/no", 0, false, true}, {"/api/incidents/1/other", 0, false, true}, {"/api/incidents/1/calls/2", 0, false, true},
	} {
		id, members, err := incidentPath(tc.path)
		if (err != nil) != tc.invalid || !tc.invalid && (id != tc.id || members != tc.members) {
			t.Errorf("%s: %d %v %v", tc.path, id, members, err)
		}
	}
}

func TestValidateIncidentMutation(t *testing.T) {
	for _, tc := range []struct {
		name    string
		input   incidentMutationInput
		invalid bool
	}{
		{"no address", incidentMutationInput{IncidentType: " Fire ", Calls: []incidentMemberInput{{CallID: 1}}}, false},
		{"empty", incidentMutationInput{IncidentType: "Fire"}, true},
		{"duplicate", incidentMutationInput{IncidentType: "Fire", Calls: []incidentMemberInput{{CallID: 1}, {CallID: 1}}}, true},
		{"zero", incidentMutationInput{IncidentType: "Fire", Calls: []incidentMemberInput{{CallID: 0}}}, true},
		{"type length", incidentMutationInput{IncidentType: strings.Repeat("x", 201), Calls: []incidentMemberInput{{CallID: 1}}}, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if err := validateIncidentMutation(&tc.input, true, true); (err != nil) != tc.invalid {
				t.Fatalf("error = %v", err)
			}
		})
	}
}

// * Integration tests only use an explicit DSN and create their own schema.
func incidentTestAPI(t *testing.T) (*Api, *Client) {
	t.Helper()
	dsn := os.Getenv("TLR_INCIDENT_TEST_DSN")
	if dsn == "" {
		t.Skip("set TLR_INCIDENT_TEST_DSN for isolated PostgreSQL incident tests")
	}
	root, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	schema := fmt.Sprintf("incident_test_%d", time.Now().UnixNano())
	if _, err := root.Exec(`CREATE SCHEMA ` + schema); err != nil {
		root.Close()
		t.Fatal(err)
	}
	parsed, err := url.Parse(dsn)
	if err != nil {
		t.Fatal(err)
	}
	query := parsed.Query()
	query.Set("search_path", schema)
	parsed.RawQuery = query.Encode()
	db, err := sql.Open("pgx", parsed.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close(); root.Exec(`DROP SCHEMA ` + schema + ` CASCADE`); root.Close() })
	for _, query := range []string{
		`CREATE TABLE "calls" ("callId" bigint PRIMARY KEY,"timestamp" bigint NOT NULL,"systemId" bigint NOT NULL,"talkgroupId" bigint NOT NULL,"parsedAddress" text,"transcript" text,"alertSummary" text)`,
		`CREATE TABLE "talkgroups" ("talkgroupId" bigint PRIMARY KEY,"talkgroupRef" integer)`,
		`INSERT INTO "talkgroups" VALUES (10,100),(11,101)`,
		`INSERT INTO "calls" ("callId","timestamp","systemId","talkgroupId") VALUES (1,1000,1,10),(2,2000,1,11),(3,3000,1,10),(4,4000,1,10)`,
	} {
		if _, err := db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	database := &Database{Sql: db}
	if err := migrateIncidents(database); err != nil {
		t.Fatal(err)
	}
	if err := migrateManualIncidents(database); err != nil {
		t.Fatal(err)
	}
	system := NewSystem()
	system.Id = 1
	system.SystemRef = 1
	system.Label = "Test"
	system.Talkgroups.List = []*Talkgroup{{Id: 10, TalkgroupRef: 100}, {Id: 11, TalkgroupRef: 101}}
	systems := NewSystems()
	systems.List = []*System{system}
	user := &User{Id: 1, SystemAdmin: true, Pin: "test-pin"}
	controller := &Controller{Database: database, Systems: systems, Logs: NewLogs(), Clients: NewClients(), Options: &Options{}, Users: &Users{users: map[uint64]*User{1: user}, pins: map[string]*User{"test-pin": user}}}
	return &Api{Controller: controller}, &Client{User: user}
}

func incidentTestMutation(t *testing.T, api *Api, client *Client, method string, id uint64, members bool, input incidentMutationInput, want int) uint64 {
	t.Helper()
	body, err := json.Marshal(input)
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(method, "/api/incidents", bytes.NewReader(body))
	response := httptest.NewRecorder()
	api.mutateIncident(response, request, client, id, members)
	if response.Code != want {
		t.Fatalf("%s incident %d: status %d want %d: %s", method, id, response.Code, want, response.Body.String())
	}
	var result struct {
		IncidentID uint64 `json:"incidentId"`
	}
	if want < 300 {
		if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
	}
	return result.IncidentID
}

func incidentPointer(id uint64) *uint64 { return &id }

func TestManualIncidentLifecycle(t *testing.T) {
	api, client := incidentTestAPI(t)
	db := api.Controller.Database.Sql
	created := incidentTestMutation(t, api, client, "POST", 0, false, incidentMutationInput{IncidentType: "Structure fire", Calls: []incidentMemberInput{{CallID: 1}, {CallID: 2}}}, 201)
	var count int
	var first, last int64
	var refs, address string
	var lat sql.NullFloat64
	if err := db.QueryRow(`SELECT "callCount","firstSeenAt","lastSeenAt","talkgroupRefs","displayAddress","lat" FROM "incidents" WHERE "incidentId"=$1`, created).Scan(&count, &first, &last, &refs, &address, &lat); err != nil {
		t.Fatal(err)
	}
	if count != 2 || first != 1000 || last != 2000 || refs != "[100,101]" || address != "" || lat.Valid {
		t.Fatalf("unexpected aggregate: %d %d %d %s %s %v", count, first, last, refs, address, lat)
	}
	incidentTestMutation(t, api, client, "PUT", created, true, incidentMutationInput{Calls: []incidentMemberInput{{CallID: 1, ExpectedIncidentID: incidentPointer(created)}}}, 200)
	incidentTestMutation(t, api, client, "PUT", created, true, incidentMutationInput{Calls: []incidentMemberInput{{CallID: 3}, {CallID: 1}}}, 409)
	var linked int
	db.QueryRow(`SELECT COUNT(*) FROM "incidentCalls" WHERE "callId"=3`).Scan(&linked)
	if linked != 0 {
		t.Fatal("conflicting bulk request partially applied")
	}
	incidentTestMutation(t, api, client, "PATCH", created, false, incidentMutationInput{IncidentType: "Warehouse fire", Address: "500 South Main"}, 200)
	second := incidentTestMutation(t, api, client, "POST", 0, false, incidentMutationInput{IncidentType: "Other", Calls: []incidentMemberInput{{CallID: 3}}}, 201)
	incidentTestMutation(t, api, client, "PUT", second, true, incidentMutationInput{Calls: []incidentMemberInput{{CallID: 2, ExpectedIncidentID: incidentPointer(created)}}}, 200)
	db.QueryRow(`SELECT "callCount","lastSeenAt","talkgroupRefs" FROM "incidents" WHERE "incidentId"=$1`, created).Scan(&count, &last, &refs)
	if count != 1 || last != 1000 || refs != "[100]" {
		t.Fatalf("source not recalculated: %d %d %s", count, last, refs)
	}
	incidentTestMutation(t, api, client, "DELETE", created, true, incidentMutationInput{Calls: []incidentMemberInput{{CallID: 1, ExpectedIncidentID: incidentPointer(created)}}}, 200)
	db.QueryRow(`SELECT COUNT(*) FROM "incidents" WHERE "incidentId"=$1`, created).Scan(&count)
	if count != 0 {
		t.Fatal("empty incident retained")
	}
	parsed := &models.ParsedAddress{Address: "500 South Main", IncidentType: "Fire"}
	api.Controller.assignCallToIncident(1, 100, parsed, "")
	api.Controller.assignCallToIncident(2, 101, parsed, "")
	db.QueryRow(`SELECT COUNT(*) FROM "incidentCalls" WHERE "callId"=1`).Scan(&count)
	if count != 0 {
		t.Fatal("removed call automatically reassigned")
	}
	var actual uint64
	db.QueryRow(`SELECT "incidentId" FROM "incidentCalls" WHERE "callId"=2`).Scan(&actual)
	if actual != second {
		t.Fatal("manual assignment overwritten")
	}
}

func TestManualIncidentAccessAndReads(t *testing.T) {
	api, client := incidentTestAPI(t)
	ordinary := &Client{User: &User{Id: 2}}
	incidentTestMutation(t, api, ordinary, "POST", 0, false, incidentMutationInput{}, 403)
	restricted := &Client{User: &User{Id: 3, SystemAdmin: true, systemsData: []any{}}}
	incidentTestMutation(t, api, restricted, "POST", 0, false, incidentMutationInput{IncidentType: "Fire", Calls: []incidentMemberInput{{CallID: 1}}}, 404)
	for _, callID := range []uint64{1, 2, 3} {
		incidentTestMutation(t, api, client, "POST", 0, false, incidentMutationInput{IncidentType: "Warehouse fire", Calls: []incidentMemberInput{{CallID: callID}}}, 201)
	}
	request := httptest.NewRequest("GET", "/api/incidents?pin=test-pin&search=Warehouse&limit=1&offset=1", nil)
	response := httptest.NewRecorder()
	api.IncidentsHandler(response, request)
	var result struct {
		Incidents []map[string]any `json:"incidents"`
		HasMore   bool             `json:"hasMore"`
		CanManage bool             `json:"canManageIncidents"`
	}
	if response.Code != 200 {
		t.Fatalf("list: %s", response.Body.String())
	}
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if len(result.Incidents) != 1 || !result.HasMore || !result.CanManage || result.Incidents[0]["firstSeenAt"] != float64(2000) {
		t.Fatalf("unexpected list: %+v", result)
	}
	response = httptest.NewRecorder()
	api.IncidentsHandler(response, httptest.NewRequest("GET", "/api/incidents", nil))
	if response.Code != 401 {
		t.Fatal("unauthenticated list allowed")
	}
}

func TestAutomaticIncidentIdempotencyAndManualMetadata(t *testing.T) {
	api, client := incidentTestAPI(t)
	parsed := &models.ParsedAddress{Address: "500 Main", IncidentType: "Routine"}
	api.Controller.assignCallToIncident(1, 100, parsed, "")
	api.Controller.assignCallToIncident(1, 100, parsed, "")
	var id uint64
	var count int
	if err := api.Controller.Database.Sql.QueryRow(`SELECT "incidentId","callCount" FROM "incidents"`).Scan(&id, &count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatal("retranscription inflated call count")
	}
	incidentTestMutation(t, api, client, "PATCH", id, false, incidentMutationInput{IncidentType: "Custom incident", Address: "500 Main"}, 200)
	api.Controller.assignCallToIncident(2, 101, parsed, "")
	var kind string
	api.Controller.Database.Sql.QueryRow(`SELECT "callCount","incidentType" FROM "incidents" WHERE "incidentId"=$1`, id).Scan(&count, &kind)
	if count != 2 || kind != "Custom incident" {
		t.Fatalf("manual metadata lost: %d %s", count, kind)
	}
}

func TestManualIncidentConcurrency(t *testing.T) {
	api, client := incidentTestAPI(t)
	id := incidentTestMutation(t, api, client, "POST", 0, false, incidentMutationInput{IncidentType: "Fire", Calls: []incidentMemberInput{{CallID: 1}}}, 201)
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		api.Controller.assignCallToIncident(2, 101, &models.ParsedAddress{Address: "500 Main"}, "")
	}()
	response := httptest.NewRecorder()
	go func() {
		defer wg.Done()
		api.mutateIncident(response, httptest.NewRequest("PUT", "/api/incidents", strings.NewReader(`{"calls":[{"callId":2,"expectedIncidentId":null}]}`)), client, id, true)
	}()
	wg.Wait()
	if response.Code != 200 && response.Code != 409 {
		t.Fatalf("concurrent update: %d %s", response.Code, response.Body.String())
	}
	var count int
	api.Controller.Database.Sql.QueryRow(`SELECT COUNT(*) FROM "incidentCalls" WHERE "callId"=2`).Scan(&count)
	if count != 1 {
		t.Fatalf("call has %d memberships", count)
	}
}

func TestManualIncidentMigrationDeduplication(t *testing.T) {
	api, _ := incidentTestAPI(t)
	db := api.Controller.Database.Sql
	for _, q := range []string{
		`DROP INDEX "incidentCalls_one_incident"`,
		`INSERT INTO "incidents" ("incidentId","firstSeenAt","lastSeenAt") VALUES (100,1000,1000),(101,1000,1000)`,
		`INSERT INTO "incidentCalls" VALUES (100,1,1000),(101,1,1000)`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	if err := migrateManualIncidents(api.Controller.Database); err != nil {
		t.Fatal(err)
	}
	var id uint64
	if err := db.QueryRow(`SELECT "incidentId" FROM "incidentCalls" WHERE "callId"=1`).Scan(&id); err != nil {
		t.Fatal(err)
	}
	if id != 101 {
		t.Fatalf("wrong duplicate retained: %d", id)
	}
	if _, err := db.Exec(`INSERT INTO "incidentCalls" VALUES (100,1,2000)`); err == nil {
		t.Fatal("multiple memberships allowed")
	}
}

func TestManualIncidentCoordinatesAndRollback(t *testing.T) {
	api, client := incidentTestAPI(t)
	db := api.Controller.Database.Sql
	parsed := `{"address":"500 Main","match":{"lat":40.7,"lon":-111.9,"precision":"rooftop"}}`
	if _, err := db.Exec(`UPDATE "calls" SET "parsedAddress"=$1 WHERE "callId"=2`, parsed); err != nil {
		t.Fatal(err)
	}
	id := incidentTestMutation(t, api, client, "POST", 0, false, incidentMutationInput{IncidentType: "Fire", Calls: []incidentMemberInput{{CallID: 1}, {CallID: 2}}}, 201)
	var lat sql.NullFloat64
	db.QueryRow(`SELECT "lat" FROM "incidents" WHERE "incidentId"=$1`, id).Scan(&lat)
	if !lat.Valid || lat.Float64 != 40.7 {
		t.Fatalf("missing member coordinates: %v", lat)
	}
	incidentTestMutation(t, api, client, "DELETE", id, true, incidentMutationInput{Calls: []incidentMemberInput{{CallID: 2, ExpectedIncidentID: incidentPointer(id)}}}, 200)
	db.QueryRow(`SELECT "lat" FROM "incidents" WHERE "incidentId"=$1`, id).Scan(&lat)
	if lat.Valid {
		t.Fatal("coordinates retained after removing located member")
	}
	for _, q := range []string{
		`CREATE FUNCTION reject_manual_assignment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."callId"=4 THEN RAISE EXCEPTION 'test failure'; END IF; RETURN NEW; END $$`,
		`CREATE TRIGGER reject_manual_assignment BEFORE UPDATE ON "calls" FOR EACH ROW EXECUTE FUNCTION reject_manual_assignment()`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	incidentTestMutation(t, api, client, "POST", 0, false, incidentMutationInput{IncidentType: "Must roll back", Calls: []incidentMemberInput{{CallID: 3}, {CallID: 4}}}, 500)
	var count int
	db.QueryRow(`SELECT COUNT(*) FROM "incidentCalls" WHERE "callId" IN (3,4)`).Scan(&count)
	if count != 0 {
		t.Fatal("failed transaction retained links")
	}
	db.QueryRow(`SELECT COUNT(*) FROM "incidents" WHERE "incidentType"='Must roll back'`).Scan(&count)
	if count != 0 {
		t.Fatal("failed transaction retained incident")
	}
}

func TestManualIncidentSilentBroadcast(t *testing.T) {
	controller := &Controller{Clients: NewClients()}
	observer := &Client{User: &User{Id: 1}, Send: make(chan *Message, 1)}
	controller.Clients.Map[observer] = true
	controller.broadcastManualIncidentPoke(12, []uint64{1, 2})
	select {
	case message := <-observer.Send:
		payload, ok := message.Payload.(map[string]any)
		if !ok || payload["silent"] != true || payload["type"] != "incident" || payload["incidentId"] != uint64(12) {
			t.Fatalf("unexpected poke: %+v", message)
		}
	default:
		t.Fatal("incident poke missing")
	}
}

func TestManualIncidentOlderAlertRefresh(t *testing.T) {
	api, client := incidentTestAPI(t)
	db := api.Controller.Database.Sql
	for _, q := range []string{
		`CREATE TABLE "systems" ("systemId" bigint PRIMARY KEY,"systemRef" integer,"label" text)`,
		`INSERT INTO "systems" VALUES (1,1,'Test')`,
		`ALTER TABLE "talkgroups" ADD COLUMN "label" text, ADD COLUMN "name" text`,
		`ALTER TABLE "calls" ADD COLUMN "transcriptionStatus" text, ADD COLUMN "toneSequence" text`,
		`CREATE TABLE "alerts" ("alertId" bigint PRIMARY KEY,"callId" bigint,"systemId" bigint,"talkgroupId" bigint,"alertType" text,"toneDetected" boolean,"toneSetId" text,"keywordsMatched" text,"transcriptSnippet" text,"createdAt" bigint)`,
		`INSERT INTO "alerts" VALUES (1,1,1,10,'tone',true,'','','',1000),(2,1,1,10,'tone',true,'','','',1001)`,
		`UPDATE "calls" SET "parsedAddress"='{"incidentType":"STRUCTURE FIRE"}' WHERE "callId"=1`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	api.Controller.Options.FireIncidentTypes = defaultFireIncidentTypes()
	prefs := NewPreferencesCache(api.Controller)
	prefs.byUser[1] = map[uint64]*UserAlertPreference{makePreferenceKey(1, 10): {UserId: 1, SystemId: 1, TalkgroupId: 10, AlertEnabled: true, ToneAlerts: true}}
	api.Controller.PreferencesCache = prefs
	id := incidentTestMutation(t, api, client, "POST", 0, false, incidentMutationInput{IncidentType: "Manual incident", Address: "Warehouse", Calls: []incidentMemberInput{{CallID: 1}}}, 201)
	read := func() []map[string]any {
		t.Helper()
		response := httptest.NewRecorder()
		api.AlertsHandler(response, httptest.NewRequest("GET", "/api/alerts?pin=test-pin&since=9999999&callIds=1", nil))
		if response.Code != 200 {
			t.Fatalf("alerts: %d %s", response.Code, response.Body.String())
		}
		var alerts []map[string]any
		if err := json.Unmarshal(response.Body.Bytes(), &alerts); err != nil {
			t.Fatal(err)
		}
		return alerts
	}
	alerts := read()
	if len(alerts) != 2 {
		t.Fatalf("older call alerts not returned: %+v", alerts)
	}
	for _, alert := range alerts {
		if alert["incidentId"] != float64(id) || alert["incidentType"] != "Manual incident" || alert["incidentAddress"] != "Warehouse" || alert["incidentAssignmentManual"] != true || alert["canManageIncidents"] != true {
			t.Fatalf("missing incident metadata: %+v", alert)
		}
		if alert["fireTier"] != nil {
			t.Fatalf("parsed type overrode manual incident: %+v", alert)
		}
	}
	incidentTestMutation(t, api, client, "DELETE", id, true, incidentMutationInput{Calls: []incidentMemberInput{{CallID: 1, ExpectedIncidentID: incidentPointer(id)}}}, 200)
	for _, alert := range read() {
		if alert["incidentId"] != nil {
			t.Fatalf("stale membership: %+v", alert)
		}
	}
}
