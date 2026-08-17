//* Non-linear age bands: more visual resolution for recent alerts.
//* Band colors are data colors, not theme chrome, so hex values are intentional.
export interface AgeBand {
	maxMin: number;
	label: string;
	color: string;
	radius: number;
	opacity: number;
}

export const AGE_BANDS: AgeBand[] = [
	{ maxMin: 5, label: 'under 5 min', color: '#ef4444', radius: 9, opacity: 0.95 },
	{ maxMin: 15, label: '5 to 15 min', color: '#f97316', radius: 8, opacity: 0.9 },
	{ maxMin: 30, label: '15 to 30 min', color: '#eab308', radius: 7, opacity: 0.85 },
	{ maxMin: 60, label: '30 to 60 min', color: '#22c55e', radius: 6, opacity: 0.75 },
	{ maxMin: 120, label: '1 to 2 hr', color: '#14b8a6', radius: 5, opacity: 0.6 },
	{ maxMin: 240, label: '2 to 4 hr', color: '#3b82f6', radius: 5, opacity: 0.45 },
	{ maxMin: Infinity, label: 'over 4 hr', color: '#6b7280', radius: 4, opacity: 0.3 }
];

export function ageBand(createdAt: number, now: number): AgeBand {
	const ageMin = (now - createdAt) / 60_000;
	return AGE_BANDS.find((b) => ageMin < b.maxMin) ?? AGE_BANDS[AGE_BANDS.length - 1];
}
