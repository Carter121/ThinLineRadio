<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '$lib/components/ui/table';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import Plus from '@lucide/svelte/icons/plus';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Save from '@lucide/svelte/icons/save';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import type { AdminSessionState } from '$lib/core/admin-session.svelte.ts';
	import FuzzyListCard from './transcript-parser/FuzzyListCard.svelte';
	import {
		emptyTranscriptConfig,
		normalizeTranscriptConfig,
		type FuzzyWord,
		type TranscriptConfig
	} from './transcript-parser/transcript-parser-types.ts';

	interface Props {
		session: AdminSessionState;
	}

	let { session }: Props = $props();

	let config = $state<TranscriptConfig>(emptyTranscriptConfig());
	let baseline = $state('');
	let loading = $state(true);
	let saving = $state(false);

	//* config is a deep $state proxy, so stringifying reads every nested value
	//* and this derived updates on any edit.
	const dirty = $derived(!loading && JSON.stringify(config) !== baseline);

	async function load() {
		loading = true;
		try {
			const raw = await session.client.request<Partial<TranscriptConfig>>('/api/admin/transcript-parser');
			config = normalizeTranscriptConfig(raw);
			baseline = JSON.stringify(config);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to load transcript parser config');
		} finally {
			loading = false;
		}
	}

	//* Uppercases and trims words, drops rows without a word/label, and omits
	//* empty alias/reject arrays (mirrors the old admin's save normalization).
	function normalized(): TranscriptConfig {
		const cleanFuzzy = (list: FuzzyWord[]): FuzzyWord[] =>
			list
				.map((row) => ({
					word: row.word.toUpperCase().trim(),
					maxDistance: Number(row.maxDistance) || 0,
					aliases: row.aliases && row.aliases.length > 0 ? row.aliases : undefined,
					reject: row.reject && row.reject.length > 0 ? row.reject : undefined
				}))
				.filter((row) => row.word.length > 0);
		return {
			unitTypes: cleanFuzzy(config.unitTypes),
			unitPrefixes: cleanFuzzy(config.unitPrefixes),
			dispatchNames: cleanFuzzy(config.dispatchNames),
			channelSeparators: cleanFuzzy(config.channelSeparators),
			corrections: cleanFuzzy(config.corrections),
			channelShorthands: config.channelShorthands
				.map((sh) => ({
					label: sh.label.toUpperCase().trim(),
					dispatch: sh.dispatch.toUpperCase().trim(),
					separator: sh.separator?.toUpperCase().trim() || undefined
				}))
				.filter((sh) => sh.label.length > 0 && sh.dispatch.length > 0)
		};
	}

	async function save() {
		saving = true;
		try {
			const payload = normalized();
			await session.client.request('/api/admin/transcript-parser', { method: 'PUT', body: JSON.stringify(payload) });
			config = normalizeTranscriptConfig(payload);
			baseline = JSON.stringify(config);
			toast.success('Transcript parser config saved');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to save transcript parser config');
		} finally {
			saving = false;
		}
	}

	function addShorthand() {
		config.channelShorthands.push({ label: '', dispatch: '', separator: '' });
	}

	//* Dirtiness comes from deep reactivity; the cards' onchange is not needed.
	const noop = () => {};

	onMount(() => {
		void load();
	});
</script>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h2 class="text-lg font-semibold">Transcript Parser</h2>
			<p class="text-sm text-muted-foreground">
				Word lists that turn raw transcript text into recognized units and channels for highlighting and alerts.
			</p>
		</div>
		<div class="flex items-center gap-2">
			{#if dirty}
				<span class="text-sm text-muted-foreground">Unsaved changes</span>
			{/if}
			<Button variant="outline" size="sm" disabled={loading || saving} onclick={() => void load()}>
				<RotateCcw data-icon="inline-start" />
				Reload
			</Button>
			<Button size="sm" disabled={!dirty || saving} onclick={save}>
				{#if saving}
					<Loader2 data-icon="inline-start" class="animate-spin" />
				{:else}
					<Save data-icon="inline-start" />
				{/if}
				Save
			</Button>
		</div>
	</div>

	<Collapsible.Root>
		<Collapsible.Trigger
			class="flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground [&[data-state=open]>svg]:rotate-90"
		>
			<ChevronRight class="size-4 transition-transform duration-200" />
			How matching works
		</Collapsible.Trigger>
		<Collapsible.Content>
			<div class="mt-2 rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
				<ol class="flex list-decimal flex-col gap-1 pl-5">
					<li>Corrections are applied to the raw transcript first; the corrected text is what gets stored and shown.</li>
					<li>Units are matched as optional Prefix + Unit Type + Number (e.g. MEDIC ENGINE 5).</li>
					<li>Channels are matched as Dispatch Name + optional Separator + Number (e.g. CITY FIRE 3), or via a Shorthand.</li>
					<li>
						Max Distance allows fuzzy matches: the number of letter edits tolerated (0 = exact). Aliases are alternative spellings treated as exact
						matches regardless of distance.
					</li>
				</ol>
			</div>
		</Collapsible.Content>
	</Collapsible.Root>

	{#if loading}
		<div class="flex min-h-40 items-center justify-center">
			<Spinner class="size-6" />
		</div>
	{:else}
		<FuzzyListCard
			title="Unit Types"
			description="The apparatus type portion of a unit identifier, the word before the unit number (and after the optional prefix). Use aliases for alternate spellings the transcriber produces (TREK for TRUCK). Use reject words to avoid false positives (add ELEVATOR so ELEVATOR RESCUE 160 is not a unit)."
			examples="ENGINE, TRUCK, LADDER, RESCUE, BATTALION, HAZMAT, MEDIC"
			bind:list={config.unitTypes}
			showReject
			onchange={noop}
		/>

		<div class="grid gap-4 xl:grid-cols-2">
			<FuzzyListCard
				title="Unit Prefixes"
				description="Optional words that appear before a unit type and are included in the highlighted span. Multi-word prefixes are supported."
				examples="MEDIC (as in MEDIC ENGINE 5), HEAVY, TACTICAL"
				bind:list={config.unitPrefixes}
				onchange={noop}
			/>
			<FuzzyListCard
				title="Dispatch Names"
				description="The agency or zone name that starts a channel reference. Use aliases for common mis-transcriptions (VEC or DECK for VECC)."
				examples="CITY, OPS, COUNTY, METRO"
				bind:list={config.dispatchNames}
				onchange={noop}
			/>
			<FuzzyListCard
				title="Channel Separators"
				description="The word between a dispatch name and a channel number. Leave empty if channels are DISPATCH NUMBER (CITY 3); when configured the format is DISPATCH SEPARATOR NUMBER (CITY FIRE 3)."
				examples="FIRE, POLICE, EMS, OPS"
				bind:list={config.channelSeparators}
				onchange={noop}
			/>

			<Card class="py-0">
				<CardHeader class="px-5 pt-4 pb-0">
					<CardTitle class="flex items-center gap-2 text-base">
						Channel Shorthands
						<Badge variant="secondary">{config.channelShorthands.length}</Badge>
						<Button variant="outline" size="sm" class="ml-auto" onclick={addShorthand}>
							<Plus data-icon="inline-start" />
							Add
						</Button>
					</CardTitle>
					<p class="text-xs text-muted-foreground">
						Abbreviated channel labels mapped to a full dispatch name. Matched exactly; space, dash, or no separator before the number all work (SF 3,
						SF-3, SF3). Separator is the optional word recorded alongside the channel.
					</p>
				</CardHeader>
				<CardContent class="px-5 pt-2 pb-4">
					{#if config.channelShorthands.length === 0}
						<p class="py-3 text-sm text-muted-foreground">Nothing configured yet.</p>
					{:else}
						<div class="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead class="w-36">Label</TableHead>
										<TableHead class="w-40">Dispatch</TableHead>
										<TableHead class="w-36">Separator</TableHead>
										<TableHead class="w-10"></TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{#each config.channelShorthands as shorthand, index (index)}
										<TableRow>
											<TableCell>
												<Input
													class="h-8 font-mono text-xs uppercase"
													placeholder="SF"
													value={shorthand.label}
													oninput={(e: Event) => (shorthand.label = (e.currentTarget as HTMLInputElement).value.toUpperCase())}
												/>
											</TableCell>
											<TableCell>
												<Input
													class="h-8 font-mono text-xs uppercase"
													placeholder="SANDY"
													value={shorthand.dispatch}
													oninput={(e: Event) => (shorthand.dispatch = (e.currentTarget as HTMLInputElement).value.toUpperCase())}
												/>
											</TableCell>
											<TableCell>
												<Input
													class="h-8 font-mono text-xs uppercase"
													placeholder="FIRE"
													value={shorthand.separator ?? ''}
													oninput={(e: Event) => (shorthand.separator = (e.currentTarget as HTMLInputElement).value.toUpperCase())}
												/>
											</TableCell>
											<TableCell>
												<Button
													variant="ghost"
													size="icon-sm"
													class="text-destructive"
													aria-label="Delete shorthand"
													onclick={() => config.channelShorthands.splice(index, 1)}
												>
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
		</div>

		<FuzzyListCard
			title="Corrections"
			description="Plain-text replacements applied to the raw transcript before any parsing runs. The Word field is the correct replacement; aliases are the wrong forms to replace. Max Distance catches slight variations of the wrong forms."
			examples="SHORT FALL (alias SHORT HALL), UNKNOWN MEDICAL (alias A KNOWN MEDICAL)"
			bind:list={config.corrections}
			onchange={noop}
		/>
	{/if}
</div>
