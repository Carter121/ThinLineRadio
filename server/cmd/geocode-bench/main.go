//* Benchmarks the PostgresGeocoder against real production transcripts.
//* Reads a CSV export (callId, transcript, parsedAddress) and reports the
//* match rate versus the recorded Nominatim results.
//*
//* Usage:
//*   go run ./cmd/geocode-bench -csv prod-transcripts.csv \
//*     -db "postgresql://thinline_user:devpass@localhost:5432/thinline_radio" [-v]
package main

import (
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"os"

	_ "github.com/jackc/pgx/v5/stdlib"

	"rdio-scanner/server/internal/address"
	"rdio-scanner/server/internal/models"
)

func main() {
	csvPath := flag.String("csv", "", "CSV export of transcriptions (callId,transcript,parsedAddress)")
	dbURL := flag.String("db", "", "Postgres URL with address_points loaded")
	verbose := flag.Bool("v", false, "print each miss")
	flag.Parse()
	if *csvPath == "" || *dbURL == "" {
		flag.Usage()
		os.Exit(1)
	}

	db, err := sql.Open("pgx", *dbURL)
	if err != nil {
		log.Fatalf("db open: %v", err)
	}
	defer db.Close()
	geocoder := address.NewPostgresGeocoder(db)

	f, err := os.Open(*csvPath)
	if err != nil {
		log.Fatalf("open csv: %v", err)
	}
	defer f.Close()

	reader := csv.NewReader(f)
	if _, err := reader.Read(); err != nil {
		log.Fatalf("read header: %v", err)
	}

	var total, parsed, pgMatched, nomMatched, both, pgOnly, nomOnly, neither int
	precisions := map[string]int{}
	for {
		rec, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			log.Fatalf("read csv: %v", err)
		}
		total++

		//* Re-parse from the raw transcript so parser changes are reflected
		parsedAddr := address.ParseAddress(rec[1])
		if parsedAddr == nil {
			continue
		}
		parsed++

		//* Nominatim baseline comes from the stored parsedAddress JSON
		nomHit := false
		if rec[2] != "" {
			var stored models.ParsedAddress
			if json.Unmarshal([]byte(rec[2]), &stored) == nil && stored.Match != nil {
				nomHit = true
			}
		}

		match, err := geocoder.Lookup(parsedAddr)
		if err != nil {
			log.Fatalf("lookup call %s: %v", rec[0], err)
		}

		pgHit := match != nil
		if pgHit {
			pgMatched++
			precisions[match.Precision]++
			if *verbose && match.Precision != "rooftop" {
				fmt.Printf("%-12s call=%s addr=%q -> %q\n", match.Precision, rec[0], parsedAddr.Address, match.FullAddress)
			}
		}
		if nomHit {
			nomMatched++
		}
		switch {
		case pgHit && nomHit:
			both++
		case pgHit:
			pgOnly++
		case nomHit:
			nomOnly++
			if *verbose {
				fmt.Printf("NOM-ONLY call=%s addr=%q city=%q\n", rec[0], parsedAddr.Address, parsedAddr.City)
			}
		default:
			neither++
			if *verbose {
				fmt.Printf("NEITHER  call=%s addr=%q city=%q\n", rec[0], parsedAddr.Address, parsedAddr.City)
			}
		}
	}

	fmt.Printf("\ntranscripts=%d parsed=%d\n", total, parsed)
	fmt.Printf("postgres matched: %d (%.1f%% of parsed)\n", pgMatched, pct(pgMatched, parsed))
	fmt.Printf("nominatim matched: %d (%.1f%% of parsed)\n", nomMatched, pct(nomMatched, parsed))
	fmt.Printf("both=%d pg-only=%d nominatim-only=%d neither=%d\n", both, pgOnly, nomOnly, neither)
	fmt.Printf("precision: %v\n", precisions)
}

func pct(n, d int) float64 {
	if d == 0 {
		return 0
	}
	return float64(n) * 100 / float64(d)
}
