//* Shapes of the transcript parser config (GET/PUT /api/admin/transcript-parser).
//* Mirrors server/transcript_parser.go TranscriptConfig.

export interface FuzzyWord {
	word: string;
	maxDistance: number;
	aliases?: string[];
	reject?: string[];
}

export interface ChannelShorthand {
	label: string;
	dispatch: string;
	separator?: string;
}

export interface TranscriptConfig {
	unitTypes: FuzzyWord[];
	unitPrefixes: FuzzyWord[];
	dispatchNames: FuzzyWord[];
	channelSeparators: FuzzyWord[];
	channelShorthands: ChannelShorthand[];
	corrections: FuzzyWord[];
}

export type FuzzyListKey = 'unitTypes' | 'unitPrefixes' | 'dispatchNames' | 'channelSeparators' | 'corrections';

export const emptyTranscriptConfig = (): TranscriptConfig => ({
	unitTypes: [],
	unitPrefixes: [],
	dispatchNames: [],
	channelSeparators: [],
	channelShorthands: [],
	corrections: []
});

//* Fills in any missing list so the editor never touches undefined arrays.
export function normalizeTranscriptConfig(raw: Partial<TranscriptConfig> | null | undefined): TranscriptConfig {
	return {
		unitTypes: raw?.unitTypes ?? [],
		unitPrefixes: raw?.unitPrefixes ?? [],
		dispatchNames: raw?.dispatchNames ?? [],
		channelSeparators: raw?.channelSeparators ?? [],
		channelShorthands: raw?.channelShorthands ?? [],
		corrections: raw?.corrections ?? []
	};
}
