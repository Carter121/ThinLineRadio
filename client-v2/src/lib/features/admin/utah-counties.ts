//* Utah counties by FIPS code, used by the geocoding county priority editor.
export const UTAH_COUNTIES: { fips: string; name: string }[] = [
	{ fips: '49001', name: 'Beaver' },
	{ fips: '49003', name: 'Box Elder' },
	{ fips: '49005', name: 'Cache' },
	{ fips: '49007', name: 'Carbon' },
	{ fips: '49009', name: 'Daggett' },
	{ fips: '49011', name: 'Davis' },
	{ fips: '49013', name: 'Duchesne' },
	{ fips: '49015', name: 'Emery' },
	{ fips: '49017', name: 'Garfield' },
	{ fips: '49019', name: 'Grand' },
	{ fips: '49021', name: 'Iron' },
	{ fips: '49023', name: 'Juab' },
	{ fips: '49025', name: 'Kane' },
	{ fips: '49027', name: 'Millard' },
	{ fips: '49029', name: 'Morgan' },
	{ fips: '49031', name: 'Piute' },
	{ fips: '49033', name: 'Rich' },
	{ fips: '49035', name: 'Salt Lake' },
	{ fips: '49037', name: 'San Juan' },
	{ fips: '49039', name: 'Sanpete' },
	{ fips: '49041', name: 'Sevier' },
	{ fips: '49043', name: 'Summit' },
	{ fips: '49045', name: 'Tooele' },
	{ fips: '49047', name: 'Uintah' },
	{ fips: '49049', name: 'Utah' },
	{ fips: '49051', name: 'Wasatch' },
	{ fips: '49053', name: 'Washington' },
	{ fips: '49055', name: 'Wayne' },
	{ fips: '49057', name: 'Weber' }
];

export function countyName(fips: string): string {
	return UTAH_COUNTIES.find((c) => c.fips === fips)?.name ?? fips;
}
