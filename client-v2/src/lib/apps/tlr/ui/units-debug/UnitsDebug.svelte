<script lang="ts">
	import type { TranscriptAnnotationUnit } from '$lib/apps/tlr/types.ts';
	import { getTlrAlertFeed } from '$lib/apps/tlr/context.ts';
	import { formatUnitName, formatRelativeTime } from '$lib/apps/tlr/format.ts';
	import * as Table from '$lib/components/ui/table/index.ts';
	import { createSvelteTable, FlexRender, DataTableHeaderButton, renderComponent } from '$lib/components/ui/data-table/index.ts';
	import { getCoreRowModel, getFilteredRowModel, getSortedRowModel } from '@tanstack/table-core';
	import type { ColumnDef, HeaderContext, SortingState } from '@tanstack/table-core';

	const alertFeed = getTlrAlertFeed();

	interface UnitRow {
		key: string;
		name: string;
		apparatus: string;
		number: string;
		prefix: string;
		count: number;
		lastSeen: number;
		channels: string;
	}

	let unitRows = $derived.by<UnitRow[]>(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const map = new Map<string, { unit: TranscriptAnnotationUnit; count: number; lastSeen: number; channels: Set<string> }>();

		for (const alert of alertFeed.allAlerts) {
			if (!alert.transcriptAnnotations) continue;

			const channelLabel = alert.talkgroupLabel ?? alert.talkgroupName ?? '';

			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			const seen = new Set<string>();

			for (const ann of alert.transcriptAnnotations) {
				if (ann.type !== 'unit') continue;
				const unit = ann;
				const key = `${(unit.prefix ?? '').toLowerCase()}-${unit.apparatus.toLowerCase()}-${unit.number.toLowerCase()}`;
				if (seen.has(key)) continue;
				seen.add(key);

				const existing = map.get(key);
				if (existing) {
					existing.count++;
					if (alert.createdAt > existing.lastSeen) {
						existing.lastSeen = alert.createdAt;
					}
					if (channelLabel) existing.channels.add(channelLabel);
				} else {
					// eslint-disable-next-line svelte/prefer-svelte-reactivity
					const channels = new Set<string>();
					if (channelLabel) channels.add(channelLabel);
					map.set(key, { unit, count: 1, lastSeen: alert.createdAt, channels });
				}
			}
		}

		return [...map.entries()].map(([key, { unit, count, lastSeen, channels }]) => ({
			key,
			name: formatUnitName(unit),
			apparatus: unit.apparatus,
			number: unit.number,
			prefix: unit.prefix ?? '',
			count,
			lastSeen,
			channels: [...channels].sort().join(', ')
		}));
	});

	function headerButton(text: string) {
		return ({ column }: HeaderContext<UnitRow, unknown>) =>
			renderComponent(DataTableHeaderButton<UnitRow>, {
				onclick: column.getToggleSortingHandler(),
				text,
				column
			});
	}

	const columns: ColumnDef<UnitRow>[] = [
		{
			accessorKey: 'name',
			header: headerButton('Name')
		},
		{
			accessorKey: 'apparatus',
			header: headerButton('Apparatus')
		},
		{
			accessorKey: 'number',
			header: headerButton('Number')
		},
		{
			accessorKey: 'prefix',
			header: headerButton('Prefix'),
			cell: ({ getValue }) => {
				const value = getValue<string>();
				return value || '-';
			}
		},
		{
			accessorKey: 'count',
			header: headerButton('Count')
		},
		{
			accessorKey: 'channels',
			header: headerButton('Channels')
		},
		{
			accessorKey: 'lastSeen',
			header: headerButton('Last Seen'),
			cell: ({ getValue }) => {
				const value = getValue<number>();
				return formatRelativeTime(value);
			}
		}
	];

	let sorting = $state<SortingState>([
		{ id: 'number', desc: false },
		{ id: 'count', desc: true }
	]);
	let globalFilter = $state('');

	const table = createSvelteTable({
		get data() {
			return unitRows;
		},
		columns,
		state: {
			get sorting() {
				return sorting;
			},
			get globalFilter() {
				return globalFilter;
			}
		},
		onSortingChange: (updater) => {
			sorting = typeof updater === 'function' ? updater(sorting) : updater;
		},
		onGlobalFilterChange: (updater) => {
			globalFilter = typeof updater === 'function' ? updater(globalFilter) : updater;
		},
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel()
	});

	const headerGroups = $derived(table.getHeaderGroups());
	const rowModel = $derived(table.getRowModel());
</script>

<div class="flex items-center justify-between pb-4">
	<p class="text-sm text-muted-foreground">{unitRows.length} unique units</p>
	<input
		type="text"
		placeholder="Search units..."
		class="h-8 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
		bind:value={globalFilter}
	/>
</div>

<Table.Root>
	<Table.Header>
		{#each headerGroups as headerGroup (headerGroup.id)}
			<Table.Row>
				{#each headerGroup.headers as header (header.id)}
					<Table.Head colspan={header.colSpan}>
						{#if !header.isPlaceholder}
							<FlexRender content={header.column.columnDef.header} context={header.getContext()} />
						{/if}
					</Table.Head>
				{/each}
			</Table.Row>
		{/each}
	</Table.Header>
	<Table.Body>
		{#if rowModel.rows.length > 0}
			{#each rowModel.rows as row (row.id)}
				<Table.Row>
					{#each row.getVisibleCells() as cell (cell.id)}
						<Table.Cell>
							<FlexRender content={cell.column.columnDef.cell} context={cell.getContext()} />
						</Table.Cell>
					{/each}
				</Table.Row>
			{/each}
		{:else}
			<Table.Row>
				<Table.Cell colspan={columns.length} class="py-8 text-center text-muted-foreground">No units found.</Table.Cell>
			</Table.Row>
		{/if}
	</Table.Body>
</Table.Root>
