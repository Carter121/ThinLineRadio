package main

import (
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
	"testing"
)

func callSearchOptionsJSON(t *testing.T, input string) (*CallsSearchOptions, error) {
	t.Helper()
	message := &Message{}
	if err := message.FromJson([]byte(`["LCL",` + input + `]`)); err != nil {
		t.Fatal(err)
	}
	return NewCallSearchOptions().fromMap(message.Payload.(map[string]any))
}

func TestCallSearchChannelsParsing(t *testing.T) {
	for _, tc := range []struct {
		name, input string
		present     bool
		want        []CallsSearchChannel
	}{
		{"omitted", `{"system":1,"group":"Fire","talkgroup":101}`, false, nil},
		{"empty", `{"channels":[]}`, true, []CallsSearchChannel{}},
		{"single", `{"channels":[{"system":1,"talkgroup":101}]}`, true, []CallsSearchChannel{{1, 101}}},
		{"mixed and repeated", `{"channels":[{"system":1,"talkgroup":101},{"system":2,"talkgroup":101},{"system":1,"talkgroup":101},{"system":2,"talkgroup":201}]}`, true, []CallsSearchChannel{{1, 101}, {2, 101}, {2, 201}}},
		{"bounds", `{"channels":[{"system":2147483647,"talkgroup":2147483647}]}`, true, []CallsSearchChannel{{2147483647, 2147483647}}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			options, err := callSearchOptionsJSON(t, tc.input)
			if err != nil || (options.Channels != nil) != tc.present {
				t.Fatalf("options = %+v, error = %v", options, err)
			}
			if tc.present && !reflect.DeepEqual(*options.Channels, tc.want) {
				t.Fatalf("channels = %+v, want %+v", *options.Channels, tc.want)
			}
			if !tc.present && (options.System != uint(1) || options.Talkgroup != uint(101) || options.Group != "Fire") {
				t.Fatalf("legacy filters lost: %+v", options)
			}
			encoded, err := json.Marshal(options)
			if err != nil {
				t.Fatal(err)
			}
			if strings.Contains(string(encoded), `"channels"`) != tc.present || tc.name == "empty" && !strings.Contains(string(encoded), `"channels":[]`) {
				t.Fatalf("lost presence on serialization: %s", encoded)
			}
		})
	}
}

func TestCallSearchChannelsRejectMalformed(t *testing.T) {
	for _, raw := range []string{
		`null`, `{}`, `"all"`, `1`, `true`, `[null]`, `[1]`, `[[]]`, `["1:101"]`, `[{}]`,
		`[{"system":1}]`, `[{"talkgroup":101}]`,
	} {
		t.Run(raw, func(t *testing.T) {
			if options, err := callSearchOptionsJSON(t, `{"channels":`+raw+`}`); err == nil || options != nil {
				t.Fatalf("accepted malformed channels: %+v %v", options, err)
			}
		})
	}
	for _, field := range []string{"system", "talkgroup"} {
		for _, value := range []string{`null`, `"1"`, `true`, `false`, `0`, `-1`, `1.5`, `2147483648`, `1e100`, `{}`, `[]`} {
			t.Run(field+"="+value, func(t *testing.T) {
				pair := `{"system":1,"talkgroup":101}`
				if field == "system" {
					pair = fmt.Sprintf(`{"system":%s,"talkgroup":101}`, value)
				} else {
					pair = fmt.Sprintf(`{"system":1,"talkgroup":%s}`, value)
				}
				options, err := callSearchOptionsJSON(t, `{"channels":[{"system":1,"talkgroup":101},`+pair+`]}`)
				if err == nil || options != nil {
					t.Fatalf("partially accepted malformed request: %+v %v", options, err)
				}
			})
		}
	}
}

func TestCallSearchChannelsRawLimit(t *testing.T) {
	entry := `{"system":1,"talkgroup":101}`
	for _, size := range []int{maxCallSearchChannels, maxCallSearchChannels + 1} {
		t.Run(fmt.Sprint(size), func(t *testing.T) {
			input := `{"channels":[` + strings.Repeat(entry+",", size-1) + entry + `]}`
			options, err := callSearchOptionsJSON(t, input)
			if size > maxCallSearchChannels {
				if err == nil || options != nil {
					t.Fatal("duplicates bypassed raw list limit")
				}
			} else if err != nil || options.Channels == nil || len(*options.Channels) != 1 {
				t.Fatalf("at limit: %+v %v", options, err)
			}
		})
	}
}

func TestCallSearchOptionsReuse(t *testing.T) {
	options := NewCallSearchOptions()
	valid := map[string]any{"channels": []any{map[string]any{"system": float64(1), "talkgroup": float64(101)}}}
	if _, err := options.fromMap(valid); err != nil {
		t.Fatal(err)
	}
	if _, err := options.fromMap(map[string]any{"channels": nil}); err == nil {
		t.Fatal("null accepted after valid search")
	}
	parsed, err := options.fromMap(map[string]any{"group": "Fire"})
	if err != nil || parsed.Channels != nil || parsed.Group != "Fire" {
		t.Fatalf("stale state after parser reuse: %+v %v", parsed, err)
	}
}
