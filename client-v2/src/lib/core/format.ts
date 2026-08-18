import type { AddressMatch, ParsedAddress } from './types.ts';

export function formatRelativeTime(timestamp?: number | null, now: number = Date.now()): string {
	if (!timestamp) return 'Unknown';

	const diffMs = now - timestamp;
	const diffMin = Math.floor(diffMs / 60_000);
	if (diffMin < 1) return 'Just now';
	if (diffMin < 60) return `${diffMin}m ago`;

	const diffHours = Math.floor(diffMin / 60);
	if (diffHours < 24) return `${diffHours}h ago`;

	return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatAbsoluteTime(timestamp?: number | null): string {
	if (!timestamp) return '';
	return new Date(timestamp).toLocaleString('en-US', {
		hour: 'numeric',
		minute: '2-digit',
		second: '2-digit',
		hour12: false
	});
}

export function formatDuration(seconds: number): string {
	if (!isFinite(seconds) || seconds < 0) return '00:00';
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function formatFrequency(freq?: number): string | null {
	if (!freq) return null;
	return (freq / 1_000_000).toFixed(4) + ' MHz';
}

function titleCase(s: string): string {
	return s.charAt(0) + s.slice(1).toLowerCase();
}

//* Apparatus order within one company number: engine, truck family, squad,
//* ambulance, then everything else alphabetically
const APPARATUS_RANK: Record<string, number> = {
	ENGINE: 0,
	TRUCK: 1,
	LADDER: 1,
	TOWER: 1,
	QUINT: 1,
	SQUAD: 2,
	AMBULANCE: 3
};

//* Leading placement: chief first, battalion second, companies after
function unitLeadRank(apparatus: string): number {
	if (apparatus.includes('CHIEF')) return 0;
	if (apparatus === 'BATTALION') return 1;
	return 2;
}

function unitNumber(unit: { number: string }): number {
	const n = parseInt(unit.number, 10);
	return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
}

//* Sorts accumulated unit badges into a stable roster order regardless of the
//* order units appeared in transcripts: Chief, Battalion, then companies
//* grouped by number (Engine 1, Truck 1, Engine 2, Truck 2, ...). Prefixes
//* like "Medic" or "Heavy" never affect ordering.
export function sortUnits<T extends { apparatus: string; number: string }>(units: T[]): T[] {
	return [...units].sort((a, b) => {
		const lead = unitLeadRank(a.apparatus) - unitLeadRank(b.apparatus);
		if (lead !== 0) return lead;
		const num = unitNumber(a) - unitNumber(b);
		if (num !== 0) return num;
		const rank = (APPARATUS_RANK[a.apparatus] ?? 4) - (APPARATUS_RANK[b.apparatus] ?? 4);
		if (rank !== 0) return rank;
		return a.apparatus.localeCompare(b.apparatus);
	});
}

export function formatUnitName(unit: { prefix?: string; apparatus: string; number: string }): string {
	return unit.prefix ? `${titleCase(unit.prefix)} ${titleCase(unit.apparatus)} ${unit.number}` : `${titleCase(unit.apparatus)} ${unit.number}`;
}

export function formatChannelName(channel: { dispatch: string; channel: string }): string {
	if (channel.dispatch === 'VECC') return `${channel.dispatch} ${channel.channel}`;

	return `${titleCase(channel.dispatch)} ${channel.channel}`;
}

export function formatChannelNameFull(channel: { dispatch: string; channel: string }): string {
	return `${channel.dispatch} FIRE ${channel.channel}`;
}

export function formatMapsUrl(match: { lat: number; lon: number }): string {
	return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${match.lat},${match.lon}`)}`;
}

type TranscriptAlert = {
	transcript?: string;
	transcriptAnnotations?: Array<{ type: 'unit' | 'channel'; text: string; start: number; end: number }>;
};

export function getTranscriptText(alert: TranscriptAlert): string {
	return alert.transcript ?? '';
}

export function getTranscriptHTML(alert: TranscriptAlert, highlight?: string): string {
	if (!alert.transcript) return '';

	const unitAnnotations = (alert.transcriptAnnotations ?? []).filter((a) => a.type === 'unit').sort((a, b) => b.start - a.start);

	if (unitAnnotations.length === 0 && !highlight) return alert.transcript;

	let transcript = alert.transcript;

	for (const ann of unitAnnotations) {
		transcript =
			transcript.slice(0, ann.start) + `<span class="underline">${transcript.slice(ann.start, ann.end)}</span>` + transcript.slice(ann.end);
	}

	// Apply highlight last — split on HTML tags so we only match text content
	if (highlight) {
		const escaped = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const re = new RegExp(escaped, 'gi');
		transcript = transcript
			.split(/(<[^>]*>)/)
			.map((part) => {
				if (part.startsWith('<')) return part;
				return part.replace(re, (m) => `<span class="bg-yellow-500/50">${m}</span>`);
			})
			.join('');
	}

	return transcript;
}

export function formatDateTime(value: string | number | null | undefined): string {
	if (value == null || value === '') return '-';
	const d = new Date(value);
	if (isNaN(d.getTime())) return String(value);
	return d.toLocaleString('en-US', {
		month: '2-digit',
		day: '2-digit',
		year: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false
	});
}

//* Exact geocodes are rooftop points (legacy Nominatim matches have no
//* precision). "nearby", "street", "intersection", and "uncertain" are all
//* non-exact and fall back to the spoken address for display.
export function isExactMatch(match: AddressMatch | null | undefined): boolean {
	return !!match && (!match.precision || match.precision === 'rooftop');
}

//* Address text to display: the geocoded address only when it is exact,
//* otherwise the address as heard in the transcript
export function displayAddress(parsed: ParsedAddress | null | undefined): string | null {
	if (!parsed) return null;
	if (parsed.match && isExactMatch(parsed.match)) return parsed.match.fullAddress;
	return parsed.originalAddress || parsed.address || parsed.match?.fullAddress || null;
}
