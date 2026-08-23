//* Types for the Tags, Talkgroup Groups, and Keyword Lists admin sections.
//* Tags and groups are whole-list PUT resources (server/tag.go, server/group.go);
//* keyword lists are per-row CRUD (server/api.go KeywordListsHandler).

//* A tag or group row as the server returns it. `order` and `color` are
//* omitted when zero/empty. A missing `id` means "new row" on PUT.
export interface AdminLabelRow {
	id?: number;
	label: string;
	order?: number;
	color?: string;
}

export type AdminTag = AdminLabelRow;
export type AdminTalkgroupGroup = Omit<AdminLabelRow, 'color'>;

export interface AdminKeywordList {
	id: number;
	label: string;
	description: string;
	keywords: string[];
	order: number;
	createdAt?: number;
}

//* Body for POST /api/keyword-lists and PUT /api/keyword-lists/{id}.
export interface AdminKeywordListInput {
	label: string;
	description: string;
	keywords: string[];
	order: number;
}

//* The fixed color palette the old admin offered for tags. Values are stored
//* verbatim on the tag (data, not theme styling); '' means no color.
export const TAG_COLOR_OPTIONS: { value: string; label: string }[] = [
	{ value: '', label: 'None' },
	{ value: '#ff1744', label: 'Red' },
	{ value: '#ff9100', label: 'Orange' },
	{ value: '#ffea00', label: 'Yellow' },
	{ value: '#00e676', label: 'Green' },
	{ value: '#00e5ff', label: 'Cyan' },
	{ value: '#2979ff', label: 'Blue' },
	{ value: '#d500f9', label: 'Magenta' },
	{ value: '#9e9e9e', label: 'Gray' },
	{ value: '#ffffff', label: 'White' }
];
