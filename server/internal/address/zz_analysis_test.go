package address

import (
	"encoding/csv"
	"fmt"
	"io"
	"os"
	"testing"
)

//* Throwaway analysis harness, removed after use. Re-parses a prod transcript
//* CSV and writes unparsed transcripts plus no-incident-type parses to files.
func TestAnalyzeProdTranscripts(t *testing.T) {
	path := os.Getenv("TRANSCRIPTS_CSV")
	if path == "" {
		t.Skip("no csv")
	}
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	reader := csv.NewReader(f)
	reader.Read()

	unparsed, _ := os.Create(path + ".unparsed")
	noIncident, _ := os.Create(path + ".noincident")
	defer unparsed.Close()
	defer noIncident.Close()

	total, parsed, withIncident, withAddr := 0, 0, 0, 0
	for {
		rec, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatal(err)
		}
		total++
		r := ParseAddress(rec[1])
		if r == nil {
			fmt.Fprintf(unparsed, "%s\t%s\n", rec[0], rec[1])
			continue
		}
		parsed++
		if r.Address != "" {
			withAddr++
		}
		if r.IncidentType == "" {
			fmt.Fprintf(noIncident, "%s\taddr=%q\t%s\n", rec[0], r.Address, rec[1])
		} else {
			withIncident++
		}
	}
	t.Logf("total=%d parsed=%d (%.1f%%) withIncidentType=%d withAddr=%d unparsed=%d", total, parsed, 100*float64(parsed)/float64(total), withIncident, withAddr, total-parsed)
}
