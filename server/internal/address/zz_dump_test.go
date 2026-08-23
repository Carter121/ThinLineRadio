package address

import (
	"encoding/csv"
	"fmt"
	"io"
	"os"
	"testing"
)

//* Throwaway: dump callId|incidentType|address for every parse
func TestDumpParses(t *testing.T) {
	path := os.Getenv("TRANSCRIPTS_CSV")
	if path == "" {
		t.Skip("no csv")
	}
	f, _ := os.Open(path)
	defer f.Close()
	reader := csv.NewReader(f)
	reader.Read()
	out, _ := os.Create(path + ".parses")
	defer out.Close()
	for {
		rec, err := reader.Read()
		if err == io.EOF {
			break
		}
		if r := ParseAddress(rec[1]); r != nil {
			fmt.Fprintf(out, "%s|%s|%s\n", rec[0], r.IncidentType, r.Address)
		}
	}
}
