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
