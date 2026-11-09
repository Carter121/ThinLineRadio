package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"reflect"
	"testing"
	"time"
)

type callSearchFixture struct {
	controller *Controller
	client     *Client
	boundary   time.Time
}

func newCallSearchFixture(t *testing.T) callSearchFixture {
	t.Helper()
	dsn := os.Getenv("TLR_CALL_SEARCH_TEST_DSN")
	if dsn == "" {
		t.Skip("set TLR_CALL_SEARCH_TEST_DSN for isolated PostgreSQL call-search tests")
	}
	root, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { root.Close() })
	schema := fmt.Sprintf("call_search_test_%d", time.Now().UnixNano())
	if _, err := root.Exec(`CREATE SCHEMA ` + schema); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := root.Exec(`DROP SCHEMA ` + schema + ` CASCADE`); err != nil {
			t.Error(err)
		}
	})
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
	t.Cleanup(func() { db.Close() })
	for _, query := range []string{
		`CREATE TABLE "systems" ("systemId" bigint PRIMARY KEY, "systemRef" integer NOT NULL)`,
		`CREATE TABLE "talkgroups" ("talkgroupId" bigint PRIMARY KEY, "systemId" bigint, "talkgroupRef" integer NOT NULL)`,
		`CREATE TABLE "calls" ("callId" bigint PRIMARY KEY, "timestamp" bigint NOT NULL, "systemId" bigint NOT NULL, "talkgroupId" bigint NOT NULL, "systemRef" integer NOT NULL, "talkgroupRef" integer NOT NULL, "frequency" bigint, "siteRef" integer)`,
		`CREATE TABLE "delayed" ("callId" bigint PRIMARY KEY)`,
		`CREATE TABLE "callUnits" ("callId" bigint, "offset" real, "unitRef" integer)`,
		`CREATE INDEX ON "calls" ("systemRef", "talkgroupRef", "timestamp")`,
		`CREATE INDEX ON "calls" ("systemId", "timestamp")`,
		`CREATE INDEX ON "calls" ("systemId", "talkgroupId", "timestamp")`,
		`CREATE INDEX ON "callUnits" ("callId", "offset")`,
		`INSERT INTO "systems" VALUES (10,1),(20,2)`,
		`INSERT INTO "talkgroups" VALUES (110,10,101),(120,10,102),(130,10,103),(210,20,101),(220,20,201)`,
	} {
		if _, err := db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	boundary := time.Now().UTC().Truncate(24 * time.Hour).Add(-24 * time.Hour)
	for _, row := range []struct {
		id, system, talkgroup int
		at                    time.Time
	}{
		{1, 1, 101, boundary}, {2, 1, 102, boundary.Add(time.Minute)},
		{3, 2, 101, boundary.Add(time.Minute)}, {4, 2, 201, boundary.Add(2 * time.Minute)},
		{5, 1, 101, boundary.Add(time.Minute)}, {6, 1, 103, boundary.Add(3 * time.Minute)},
		{7, 2, 201, time.Now().Add(-5 * time.Minute)}, {8, 1, 101, time.Now().Add(-5 * time.Minute)},
		{9, 1, 102, time.Now().Add(-5 * time.Minute)}, {10, 2, 101, time.Now().Add(-5 * time.Minute)},
		{11, 1, 101, boundary.Add(-time.Minute)}, {12, 1, 101, boundary.Add(4 * time.Minute)},
	} {
		_, err := db.Exec(`INSERT INTO "calls" ("callId","timestamp","systemId","talkgroupId","systemRef","talkgroupRef","frequency","siteRef") SELECT $1,$2,s."systemId",t."talkgroupId",s."systemRef",t."talkgroupRef",851000000,3 FROM "systems" s JOIN "talkgroups" t ON t."systemId"=s."systemId" WHERE s."systemRef"=$3 AND t."talkgroupRef"=$4`, row.id, row.at.UnixMilli(), row.system, row.talkgroup)
		if err != nil {
			t.Fatal(err)
		}
	}
	for _, query := range []string{
		`INSERT INTO "delayed" VALUES (12)`,
		`INSERT INTO "callUnits" VALUES (1,2,502),(1,0,501)`,
	} {
		if _, err := db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	controller := &Controller{Database: &Database{Sql: db}, Options: &Options{}, Logs: NewLogs()}
	controller.Calls = NewCalls(controller)
	client := &Client{Controller: controller, Send: make(chan *Message, 4), GroupsMap: GroupsMap{
		"Fire": {1: {101, 102}, 2: {201}}, "Overlap": {1: {101}, 2: {101}},
		"Temporary": {1: {101, 102}, 2: {101, 201}},
	}}
	return callSearchFixture{controller, client, boundary}
}

func (f callSearchFixture) search(t *testing.T, input string, want []uint64, more bool) *CallsSearchResults {
	t.Helper()
	options, err := callSearchOptionsJSON(t, input)
	if err != nil {
		t.Fatal(err)
	}
	results, err := f.controller.Calls.Search(options, f.client)
	if err != nil {
		t.Fatal(err)
	}
	assertCallSearchResults(t, results, want, more)
	return results
}

func assertCallSearchResults(t *testing.T, results *CallsSearchResults, want []uint64, more bool) {
	t.Helper()
	ids := make([]uint64, 0, len(results.Results))
	for _, result := range results.Results {
		ids = append(ids, result.Id)
	}
	if !reflect.DeepEqual(ids, want) || results.HasMore != more || results.Count != uint(len(want)) {
		t.Fatalf("IDs = %v, count = %d, hasMore = %v; want %v, %d, %v", ids, results.Count, results.HasMore, want, len(want), more)
	}
}

func TestCallSearchChannelResults(t *testing.T) {
	f := newCallSearchFixture(t)
	for _, tc := range []struct {
		name, input string
		want        []uint64
	}{
		{"mixed pairs without cross product", `{"channels":[{"system":1,"talkgroup":102},{"system":2,"talkgroup":101}]}`, []uint64{2, 3, 9, 10}},
		{"duplicate pairs", `{"channels":[{"system":1,"talkgroup":101},{"system":1,"talkgroup":101}]}`, []uint64{11, 1, 5, 8}},
		{"empty overrides legacy", `{"channels":[],"system":1,"group":"Fire","talkgroup":101}`, []uint64{}},
		{"nonexistent", `{"channels":[{"system":99,"talkgroup":999}]}`, []uint64{}},
		{"system intersects", `{"channels":[{"system":1,"talkgroup":101},{"system":2,"talkgroup":101}],"system":2}`, []uint64{3, 10}},
		{"out of scope", `{"channels":[{"system":2,"talkgroup":101}],"system":1}`, []uint64{}},
		{"ignores legacy selectors", `{"channels":[{"system":1,"talkgroup":103},{"system":2,"talkgroup":101}],"group":"Fire","talkgroup":102}`, []uint64{3, 6, 10}},
		{"legacy group", `{"group":"Fire"}`, []uint64{11, 1, 2, 5, 4, 7, 8, 9}},
		{"legacy group system talkgroup intersection", `{"group":"Fire","system":2,"talkgroup":101}`, []uint64{}},
		{"legacy system talkgroup", `{"system":2,"talkgroup":101}`, []uint64{3, 10}},
		{"date lower bound inclusive", fmt.Sprintf(`{"channels":[{"system":1,"talkgroup":101}],"date":%q}`, f.boundary.Format(time.RFC3339)), []uint64{1, 5, 8}},
		{"legacy date sort", fmt.Sprintf(`{"group":"Fire","system":1,"talkgroup":101,"date":%q,"sort":-1}`, f.boundary.Format(time.RFC3339)), []uint64{8, 5, 1}},
		{"stable ascending ties", `{"date":"2000-01-01T00:00:00Z","sort":1}`, []uint64{11, 1, 2, 3, 5, 4, 6, 7, 8, 9, 10}},
		{"stable descending ties", `{"date":"2000-01-01T00:00:00Z","sort":-1}`, []uint64{10, 9, 8, 7, 6, 4, 5, 3, 2, 1, 11}},
	} {
		t.Run(tc.name, func(t *testing.T) { f.search(t, tc.input, tc.want, false) })
	}
	resolved := []CallsSearchChannel{{1, 101}, {1, 102}, {2, 201}, {1, 101}, {2, 101}}
	encoded, err := json.Marshal(map[string]any{"channels": resolved})
	if err != nil {
		t.Fatal(err)
	}
	temporary := f.search(t, `{"group":"Temporary"}`, []uint64{11, 1, 2, 3, 5, 4, 7, 8, 9, 10}, false)
	combined := f.search(t, string(encoded), []uint64{11, 1, 2, 3, 5, 4, 7, 8, 9, 10}, false)
	if !reflect.DeepEqual(temporary.Results, combined.Results) {
		t.Fatal("resolved overlapping groups differ from equivalent temporary group")
	}
	if combined.Results[1].Source != 501 || combined.Results[1].Frequency != 851000000 || combined.Results[1].Site != 3 {
		t.Fatalf("existing row metadata lost: %+v", combined.Results[1])
	}
}

func TestCallSearchPagination(t *testing.T) {
	f := newCallSearchFixture(t)
	for _, sort := range []int{1, -1} {
		for _, restricted := range []bool{false, true} {
			t.Run(fmt.Sprintf("sort%d/restricted%v", sort, restricted), func(t *testing.T) {
				f.controller.Options.UserRegistrationEnabled = restricted
				f.client.User = &User{systemsData: []any{map[string]any{"id": float64(1), "talkgroups": []any{float64(101), float64(102)}}}}
				input := fmt.Sprintf(`{"date":"2000-01-01T00:00:00Z","sort":%d,"channels":[{"system":1,"talkgroup":101},{"system":1,"talkgroup":102},{"system":1,"talkgroup":103},{"system":2,"talkgroup":101},{"system":2,"talkgroup":201}]}`, sort)
				options, err := callSearchOptionsJSON(t, input)
				if err != nil {
					t.Fatal(err)
				}
				full, err := f.controller.Calls.Search(options, f.client)
				if err != nil {
					t.Fatal(err)
				}
				for _, limit := range []uint{1, 2, uint(len(full.Results)), uint(len(full.Results) + 1)} {
					all := []CallsSearchResult{}
					for offset := uint(0); offset <= uint(len(full.Results))+limit; offset += limit {
						options.Limit, options.Offset = limit, offset
						page, err := f.controller.Calls.Search(options, f.client)
						if err != nil {
							t.Fatal(err)
						}
						start := min(int(offset), len(full.Results))
						end := min(start+int(limit), len(full.Results))
						want := []uint64{}
						for _, row := range full.Results[start:end] {
							want = append(want, row.Id)
						}
						assertCallSearchResults(t, page, want, end < len(full.Results))
						if page.Options.Offset != offset || page.Options.Limit != limit {
							t.Fatal("response pagination options differ from request")
						}
						all = append(all, page.Results...)
					}
					if !reflect.DeepEqual(all, full.Results) {
						t.Fatal("paged rows differ from full search")
					}
				}
			})
		}
	}
}

func TestCallSearchAccessAndDelays(t *testing.T) {
	f := newCallSearchFixture(t)
	f.controller.Options.UserRegistrationEnabled = true
	all := `{"date":"2000-01-01T00:00:00Z","channels":[{"system":1,"talkgroup":101},{"system":1,"talkgroup":102},{"system":1,"talkgroup":103},{"system":2,"talkgroup":101},{"system":2,"talkgroup":201}]}`
	f.search(t, all, []uint64{}, false)
	f.client.User = &User{systemsData: []any{}}
	f.search(t, all, []uint64{}, false)
	f.client.User = &User{systemsData: []any{map[string]any{"id": float64(1), "talkgroups": []any{float64(101), float64(102)}}}, talkgroupDelaysMap: map[string]uint{"1:102": 10}}
	f.search(t, all, []uint64{11, 1, 2, 5, 8}, false)
	f.search(t, `{"channels":[{"system":2,"talkgroup":201}]}`, []uint64{}, false)
	f.client.User = &User{talkgroupDelaysMap: map[string]uint{"1:101": 2, "1:102": 10}, systemDelaysMap: map[uint64]uint{2: 10}}
	f.search(t, all, []uint64{11, 1, 2, 3, 5, 4, 6, 8}, false)
	f.client.User = &User{Delay: 10}
	f.search(t, all, []uint64{11, 1, 2, 3, 5, 4, 6}, false)
	f.controller.UserGroups = NewUserGroups()
	f.controller.UserGroups.groups[1] = &UserGroup{Id: 1, Delay: 10, talkgroupDelaysMap: map[string]uint{"1:101": 2}}
	f.client.User = &User{UserGroupId: 1}
	f.search(t, all, []uint64{11, 1, 2, 3, 5, 4, 6, 8}, false)
	f.controller.UserGroups.groups[1].systemAccessDataNew = []map[string]any{map[string]any{"id": float64(1), "talkgroups": []any{float64(101)}}}
	f.search(t, all, []uint64{11, 1, 5, 8}, false)
	f.client.User = &User{}
	f.controller.Options.DefaultSystemDelay = 10
	f.search(t, all, []uint64{11, 1, 2, 3, 5, 4, 6}, false)
	f.controller.Options.UserRegistrationEnabled = false
	f.search(t, all, []uint64{11, 1, 2, 3, 5, 4, 6}, false)
	//* Removing a released queue row makes it visible without changing the channel selection.
	f.controller.Options.DefaultSystemDelay = 0
	if _, err := f.controller.Database.Sql.Exec(`DELETE FROM "delayed" WHERE "callId"=12`); err != nil {
		t.Fatal(err)
	}
	f.search(t, all, []uint64{11, 1, 2, 3, 5, 4, 6, 12, 7, 8, 9, 10}, false)
}

func TestCallSearchAccessPaginationAcrossChunks(t *testing.T) {
	f := newCallSearchFixture(t)
	f.controller.Options.UserRegistrationEnabled = true
	f.client.User = &User{systemsData: []any{map[string]any{"id": float64(1), "talkgroups": []any{float64(101)}}}, talkgroupDelaysMap: map[string]uint{"1:102": 10}}
	if _, err := f.controller.Database.Sql.Exec(`INSERT INTO "calls" SELECT n, $1,10,130,1,103,NULL,NULL FROM generate_series(100,2200) n`, f.boundary.Add(30*time.Second).UnixMilli()); err != nil {
		t.Fatal(err)
	}
	f.search(t, `{"limit":2,"offset":1,"channels":[{"system":1,"talkgroup":101},{"system":1,"talkgroup":102},{"system":1,"talkgroup":103}]}`, []uint64{1, 5}, true)
	f.search(t, `{"limit":2,"offset":3,"channels":[{"system":1,"talkgroup":101},{"system":1,"talkgroup":102},{"system":1,"talkgroup":103}]}`, []uint64{8}, false)
}

func TestCallSearchLargeSelection(t *testing.T) {
	f := newCallSearchFixture(t)
	//* Synthetic history with the existing ref/time and source indexes, never application data.
	if _, err := f.controller.Database.Sql.Exec(`INSERT INTO "calls" SELECT 1000+n,$1::bigint+n,CASE WHEN n%2=0 THEN 10 ELSE 20 END,100+n%5000,1+n%2,1+n%5000,NULL,NULL FROM generate_series(1,100000) n`, f.boundary.UnixMilli()); err != nil {
		t.Fatal(err)
	}
	if _, err := f.controller.Database.Sql.Exec(`ANALYZE "calls"`); err != nil {
		t.Fatal(err)
	}
	channels := make([]CallsSearchChannel, 0, maxCallSearchChannels)
	for system := uint(1); system <= 2; system++ {
		for talkgroup := uint(1); talkgroup <= 5000; talkgroup++ {
			channels = append(channels, CallsSearchChannel{system, talkgroup})
		}
	}
	input, err := json.Marshal(map[string]any{"channels": channels, "limit": 20, "date": f.boundary.Format(time.RFC3339), "sort": -1})
	if err != nil {
		t.Fatal(err)
	}
	started := time.Now()
	options, err := callSearchOptionsJSON(t, string(input))
	if err != nil {
		t.Fatal(err)
	}
	results, err := f.controller.Calls.Search(options, f.client)
	if err != nil {
		t.Fatal(err)
	}
	if len(results.Results) != 20 || !results.HasMore || results.Results[0].Id != 10 {
		t.Fatalf("large selection did not preserve results: %+v", results)
	}
	t.Logf("10,000 selected channels across 100,000 synthetic history rows: %s", time.Since(started))
}
