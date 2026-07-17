import type { ColumnDef } from '@tanstack/table-core';
import type { EnrichedCallResult } from './CallHistoryState.svelte.ts';
import type { CallHistoryState } from './CallHistoryState.svelte.ts';
import { formatDateTime } from '$lib/core/format.ts';

export function createCallHistoryColumns(state: CallHistoryState): ColumnDef<EnrichedCallResult>[] {
	return [
		{
			accessorKey: 'dateTime',
			header: 'Date/Time',
			cell: ({ getValue }) => formatDateTime(getValue() as string),
			size: 90
		},
		{
			accessorKey: 'systemLabel',
			header: 'System',
			cell: ({ row }) => row.original.systemLabel ?? String(row.original.system),
			size: 90
		},
		{
			id: 'talkgroup',
			header: 'Talkgroup',
			cell: ({ row }) => {
				const label = row.original.talkgroupLabel ?? row.original.talkgroupName;
				return label ?? String(row.original.talkgroup);
			}
		},
		{
			accessorKey: 'source',
			header: 'Source',
			cell: ({ row }) => {
				const src = row.original.source;
				if (src == null) return '-';
				return state.resolveSourceAlias(src, row.original.system) ?? String(src);
			},
			size: 90
		}
	];
}
