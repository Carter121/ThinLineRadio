<script lang="ts">
	//* Editable table for one FuzzyWord list (unit types, prefixes, dispatch
	//* names, separators, corrections). Rows edit in place; the parent owns the
	//* reactive config and tracks dirtiness by comparing against its baseline.
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '$lib/components/ui/table';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import type { FuzzyWord } from './transcript-parser-types.ts';
	import ChipListEditor from './ChipListEditor.svelte';

	interface Props {
		title: string;
		description: string;
		examples?: string;
		list: FuzzyWord[];
		//* unitTypes get a "reject if preceded by" column.
		showReject?: boolean;
		onchange: () => void;
	}

	let { title, description, examples, list = $bindable(), showReject = false, onchange }: Props = $props();

	function addRow() {
		list.push({ word: '', maxDistance: 0, aliases: [], reject: [] });
		onchange();
	}

	function removeRow(index: number) {
		list.splice(index, 1);
		onchange();
	}
</script>

<Card class="py-0">
	<CardHeader class="px-5 pt-4 pb-0">
		<CardTitle class="flex items-center gap-2 text-base">
			{title}
			<Badge variant="secondary">{list.length}</Badge>
			<Button variant="outline" size="sm" class="ml-auto" onclick={addRow}>
				<Plus data-icon="inline-start" />
				Add
			</Button>
		</CardTitle>
		<p class="text-xs text-muted-foreground">
			{description}
			{#if examples}
				<span class="font-medium">Examples:</span> <span class="font-mono">{examples}</span>
			{/if}
		</p>
	</CardHeader>
	<CardContent class="px-5 pt-2 pb-4">
		{#if list.length === 0}
			<p class="py-3 text-sm text-muted-foreground">Nothing configured yet.</p>
		{:else}
			<div class="overflow-x-auto">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead class="w-44">Word</TableHead>
							<TableHead class="w-24">Max Dist.</TableHead>
							<TableHead>Aliases</TableHead>
							{#if showReject}
								<TableHead>Reject if preceded by</TableHead>
							{/if}
							<TableHead class="w-10"></TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{#each list as row, index (index)}
							<TableRow>
								<TableCell>
									<Input
										class="h-8 font-mono text-xs uppercase"
										placeholder="WORD"
										value={row.word}
										oninput={(e: Event) => {
											row.word = (e.currentTarget as HTMLInputElement).value.toUpperCase();
											onchange();
										}}
									/>
								</TableCell>
								<TableCell>
									<Input
										type="number"
										min={0}
										max={5}
										class="h-8 w-20 text-center"
										title="Levenshtein distance; 0 = exact match"
										value={String(row.maxDistance ?? 0)}
										onchange={(e: Event) => {
											const parsed = Number((e.currentTarget as HTMLInputElement).value);
											row.maxDistance = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
											onchange();
										}}
									/>
								</TableCell>
								<TableCell>
									<ChipListEditor bind:items={() => row.aliases ?? [], (v) => (row.aliases = v)} placeholder="Add alias" {onchange} />
								</TableCell>
								{#if showReject}
									<TableCell>
										<ChipListEditor bind:items={() => row.reject ?? [], (v) => (row.reject = v)} placeholder="Add word" {onchange} />
									</TableCell>
								{/if}
								<TableCell>
									<Button variant="ghost" size="icon-sm" class="text-destructive" aria-label="Delete row" onclick={() => removeRow(index)}>
										<Trash2 class="size-4" />
									</Button>
								</TableCell>
							</TableRow>
						{/each}
					</TableBody>
				</Table>
			</div>
		{/if}
	</CardContent>
</Card>
