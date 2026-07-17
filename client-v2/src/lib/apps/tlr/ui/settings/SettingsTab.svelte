<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import * as Popover from '$lib/components/ui/popover';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import BellRing from '@lucide/svelte/icons/bell-ring';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ListChecks from '@lucide/svelte/icons/list-checks';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import Save from '@lucide/svelte/icons/save';

	import { getTlrClient } from '$lib/apps/tlr/context.ts';
	import { AlertPreferencesState, type PreferenceRow } from './AlertPreferencesState.svelte.ts';

	const client = getTlrClient();
	const state = new AlertPreferencesState(client);

	onMount(() => {
		state.start();
	});

	onDestroy(() => {
		state.destroy();
	});

	function keywordListSummary(row: PreferenceRow): string {
		const count = row.pref.keywordListIds?.length ?? 0;
		if (count === 0) return 'None';
		const labels = (row.pref.keywordListIds ?? [])
			.map((id) => state.keywordLists.find((l) => l.id === id)?.label)
			.filter((label): label is string => !!label);
		return labels.length > 0 ? labels.join(', ') : `${count} selected`;
	}

	function toggleKeywordList(row: PreferenceRow, listId: number, checked: boolean) {
		const current = row.pref.keywordListIds ?? [];
		const next = checked ? [...new Set([...current, listId])] : current.filter((id) => id !== listId);
		state.updatePref(row, { keywordListIds: next });
	}

	function customKeywordsText(row: PreferenceRow): string {
		return (row.pref.keywords ?? []).join(', ');
	}

	function setCustomKeywords(row: PreferenceRow, text: string) {
		const keywords = text
			.split(',')
			.map((k) => k.trim())
			.filter((k) => k.length > 0);
		state.updatePref(row, { keywords });
	}

	function enabledCount(rows: PreferenceRow[]): number {
		return rows.filter((r) => r.pref.alertEnabled).length;
	}
</script>

<div class="space-y-4 pb-24">
	<Card class="gap-0 border-border/60 py-0">
		<CardHeader class="px-3.5 pt-3 pb-2">
			<CardTitle class="flex items-center gap-2 text-sm">
				<BellRing class="size-3.5" />
				Alert Preferences
			</CardTitle>
		</CardHeader>
		<CardContent class="space-y-3 px-3.5 pt-0 pb-3.5">
			<p class="text-sm text-muted-foreground">
				Choose which talkgroups can raise alerts for you, and how they trigger (tones, keyword lists, custom keywords).
			</p>

			{#if state.loading}
				<div class="flex items-center gap-2 py-6 text-sm text-muted-foreground">
					<Loader2 class="size-4 animate-spin" />
					Loading preferences...
				</div>
			{:else if state.loadError}
				<p class="py-4 text-sm text-destructive">{state.loadError}</p>
			{:else}
				{#each [...state.rows] as [systemLabel, tagMap] (systemLabel)}
					<Collapsible.Root class="rounded-lg border border-border">
						<div class="flex items-center gap-3 px-4 py-3">
							<Collapsible.Trigger class="flex flex-1 cursor-pointer items-center gap-2.5 text-base font-medium [&[data-state=open]>svg]:rotate-90">
								<ChevronRight class="size-5 shrink-0 transition-transform duration-200" />
								<span class="truncate">{systemLabel}</span>
								<Badge variant="secondary" class="ml-auto px-2 py-0.5 text-sm tabular-nums">
									{[...tagMap.values()].reduce((n, rows) => n + enabledCount(rows), 0)} alerting
								</Badge>
							</Collapsible.Trigger>
							<Button variant="ghost" size="sm" class="h-8 px-3 text-sm" onclick={() => state.setAllForSystem(systemLabel, true)}>
								Enable all
							</Button>
							<Button variant="ghost" size="sm" class="h-8 px-3 text-sm" onclick={() => state.setAllForSystem(systemLabel, false)}>
								Disable all
							</Button>
						</div>

						<Collapsible.Content class="space-y-2 px-4 pb-3">
							{#each [...tagMap] as [tag, rows] (tag)}
								<Collapsible.Root class="rounded-md border border-border/50">
									<div class="flex items-center gap-2.5 px-3 py-2.5">
										<Collapsible.Trigger class="flex flex-1 cursor-pointer items-center gap-2 text-sm font-medium [&[data-state=open]>svg]:rotate-90">
											<ChevronRight class="size-4 shrink-0 transition-transform duration-200" />
											<span class="truncate text-muted-foreground">{tag}</span>
											<Badge variant="outline" class="ml-auto px-2 py-0.5 text-xs tabular-nums">
												{enabledCount(rows)}/{rows.length}
											</Badge>
										</Collapsible.Trigger>
									</div>

									<Collapsible.Content class="space-y-1 px-3 pb-2.5">
										<div class="hidden items-center gap-3 px-2.5 pb-1 text-xs text-muted-foreground sm:flex">
											<span class="flex-1">Talkgroup</span>
											<span class="w-14 text-center">Alerts</span>
											<span class="w-14 text-center">Tones</span>
											<span class="w-40">Keyword lists</span>
											<span class="w-44">Custom keywords</span>
										</div>
										{#each rows as row (row.key)}
											<div
												class={[
													'flex flex-wrap items-center gap-3 rounded-md px-2.5 py-2 text-sm hover:bg-muted/50',
													state.isDirty(row.key) && 'bg-primary/5'
												]}
											>
												<div class="min-w-40 flex-1">
													<span class="font-medium">{row.talkgroupLabel}</span>
													{#if row.talkgroupName}
														<span class="ml-2 text-muted-foreground">{row.talkgroupName}</span>
													{/if}
												</div>

												<div class="flex w-14 justify-center">
													<Switch
														checked={row.pref.alertEnabled}
														onCheckedChange={(checked: boolean) => state.updatePref(row, { alertEnabled: checked })}
														aria-label={`Alerts for ${row.talkgroupLabel}`}
													/>
												</div>

												<div class="flex w-14 justify-center">
													<Switch
														checked={row.pref.toneAlerts}
														disabled={!row.pref.alertEnabled}
														onCheckedChange={(checked: boolean) => state.updatePref(row, { toneAlerts: checked })}
														aria-label={`Tone alerts for ${row.talkgroupLabel}`}
													/>
												</div>

												<div class="w-40">
													<Popover.Root>
														<Popover.Trigger>
															{#snippet child({ props })}
																<Button {...props} variant="outline" size="sm" class="h-8 w-full justify-start gap-1.5 truncate text-xs" disabled={!row.pref.alertEnabled}>
																	<ListChecks class="size-3.5 shrink-0" />
																	<span class="truncate">{keywordListSummary(row)}</span>
																</Button>
															{/snippet}
														</Popover.Trigger>
														<Popover.Content class="w-72 space-y-1 p-2">
															{#each state.keywordLists as list (list.id)}
																<label class="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50">
																	<Checkbox
																		checked={(row.pref.keywordListIds ?? []).includes(list.id)}
																		onCheckedChange={(checked) => toggleKeywordList(row, list.id, checked === true)}
																	/>
																	<span>
																		<span class="font-medium">{list.label}</span>
																		{#if list.description}
																			<span class="block text-xs text-muted-foreground">{list.description}</span>
																		{/if}
																	</span>
																</label>
															{:else}
																<p class="px-2 py-1.5 text-sm text-muted-foreground">No keyword lists defined.</p>
															{/each}
														</Popover.Content>
													</Popover.Root>
												</div>

												<Input
													class="h-8 w-44 text-xs"
													placeholder="keyword, keyword"
													disabled={!row.pref.alertEnabled}
													value={customKeywordsText(row)}
													onchange={(e: Event) => setCustomKeywords(row, (e.currentTarget as HTMLInputElement).value)}
												/>
											</div>
										{/each}
									</Collapsible.Content>
								</Collapsible.Root>
							{/each}
						</Collapsible.Content>
					</Collapsible.Root>
				{:else}
					<p class="py-4 text-center text-sm text-muted-foreground">No systems available. Waiting for configuration...</p>
				{/each}
			{/if}
		</CardContent>
	</Card>
</div>

<!-- Sticky save bar -->
{#if state.dirtyCount > 0 || state.saveError}
	<div class="fixed right-0 bottom-0 left-0 z-50 border-t border-border bg-background">
		<div class="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
			<p class="min-w-0 flex-1 truncate text-sm">
				{#if state.saveError}
					<span class="text-destructive">Save failed: {state.saveError}</span>
				{:else}
					{state.dirtyCount} unsaved {state.dirtyCount === 1 ? 'change' : 'changes'}
				{/if}
			</p>
			<Button size="sm" class="gap-1.5" disabled={state.saving || state.dirtyCount === 0} onclick={() => state.save()}>
				{#if state.saving}
					<Loader2 class="size-3.5 animate-spin" />
				{:else}
					<Save class="size-3.5" />
				{/if}
				Save changes
			</Button>
		</div>
	</div>
{/if}
