#!/usr/bin/env bash
#* Imports Utah UGRC address points (GeoPackage) into a Postgres table for geocoding.
#* Streams GPKG -> CSV (lat/lon, EPSG:4326) via ogr2ogr, loads into a staging table
#* with psql \copy, builds indexes, then atomically swaps it in as "address_points".
#* Safe to re-run: the live table stays queryable until the swap at the end.
#*
#* Requires: ogr2ogr (GDAL), psql. Run from any machine that can reach the DB.
#*
#* Usage:
#*   ./scripts/import-address-points.sh <file.gpkg> <postgres-url>
#* Example:
#*   ./scripts/import-address-points.sh ~/Downloads/UtahAddressPoints.gpkg \
#*     "postgresql://thinline_user:PASS@localhost:5432/thinline_radio"
#*
#* Optional: restrict to specific counties with COUNTIES (comma-separated FIPS codes).
#*   COUNTIES=49035,49049 ./scripts/import-address-points.sh ...
#* Utah FIPS: 49035 Salt Lake, 49049 Utah, 49011 Davis, 49057 Weber, 49045 Tooele,
#* 49043 Summit, 49051 Wasatch, 49029 Morgan, 49003 Box Elder, 49005 Cache

set -euo pipefail

GPKG="${1:?usage: import-address-points.sh <file.gpkg> <postgres-url>}"
DB_URL="${2:?usage: import-address-points.sh <file.gpkg> <postgres-url>}"
LAYER="${LAYER:-AddressPoints}"
COUNTIES="${COUNTIES:-}"

WHERE_ARGS=()
if [[ -n "$COUNTIES" ]]; then
    FIPS_LIST="'${COUNTIES//,/\',\'}'"
    WHERE_ARGS=(-where "CountyID IN ($FIPS_LIST)")
    echo "==> Filtering to counties: $FIPS_LIST"
fi

command -v ogr2ogr >/dev/null || { echo "ogr2ogr not found (install GDAL)"; exit 1; }
command -v psql >/dev/null || { echo "psql not found"; exit 1; }
[[ -f "$GPKG" ]] || { echo "file not found: $GPKG"; exit 1; }

PSQL=(psql "$DB_URL" -v ON_ERROR_STOP=1 -q)

echo "==> Creating staging table"
"${PSQL[@]}" <<'SQL'
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DROP TABLE IF EXISTS address_points_stage;
CREATE TABLE address_points_stage (
    lon             double precision,
    lat             double precision,
    full_add        text,
    add_num         text,
    add_num_suffix  text,
    prefix_dir      text,
    street_name     text,
    street_type     text,
    suffix_dir      text,
    landmark_name   text,
    building        text,
    unit_type       text,
    unit_id         text,
    city            text,
    zip_code        text,
    county_id       text,
    state           text,
    pt_type         text
);
SQL

echo "==> Streaming $LAYER from $GPKG into staging (1.5M rows takes a few minutes)"
#* GEOMETRY=AS_XY emits X (lon) and Y (lat) as the first two CSV columns.
ogr2ogr -f CSV /vsistdout/ "$GPKG" "$LAYER" \
    -t_srs EPSG:4326 \
    -lco GEOMETRY=AS_XY \
    "${WHERE_ARGS[@]}" \
    -select "FullAdd,AddNum,AddNumSuffix,PrefixDir,StreetName,StreetType,SuffixDir,LandmarkName,Building,UnitType,UnitID,City,ZipCode,CountyID,State,PtType" \
  | "${PSQL[@]}" -c "\copy address_points_stage FROM STDIN WITH (FORMAT csv, HEADER true)"

echo "==> Building indexes"
"${PSQL[@]}" <<'SQL'
--* Uppercase text fields so lookups can compare without lower()/upper() per row
UPDATE address_points_stage SET
    full_add    = upper(full_add),
    street_name = upper(street_name),
    city        = upper(city),
    landmark_name = upper(landmark_name)
WHERE full_add IS DISTINCT FROM upper(full_add)
   OR street_name IS DISTINCT FROM upper(street_name)
   OR city IS DISTINCT FROM upper(city)
   OR landmark_name IS DISTINCT FROM upper(landmark_name);

--* Numeric house number for nearest-address fallback queries
ALTER TABLE address_points_stage ADD COLUMN add_num_int integer
    GENERATED ALWAYS AS (CASE WHEN add_num ~ '^[0-9]+$' THEN add_num::integer END) STORED;

CREATE INDEX ON address_points_stage USING gin (full_add gin_trgm_ops);
CREATE INDEX ON address_points_stage USING gin (street_name gin_trgm_ops);
CREATE INDEX ON address_points_stage (street_name, add_num_int);
CREATE INDEX ON address_points_stage (add_num);
CREATE INDEX ON address_points_stage (city);
CREATE INDEX ON address_points_stage USING gin (landmark_name gin_trgm_ops);
ANALYZE address_points_stage;
SQL

echo "==> Swapping staging table into place as address_points"
"${PSQL[@]}" <<'SQL'
BEGIN;
DROP TABLE IF EXISTS address_points;
ALTER TABLE address_points_stage RENAME TO address_points;
COMMIT;
SQL

COUNT=$("${PSQL[@]}" -t -A -c "SELECT count(*) FROM address_points")
echo "==> Done: $COUNT rows in address_points"
