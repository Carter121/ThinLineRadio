<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ListChecks from '@lucide/svelte/icons/list-checks';
	import Search from '@lucide/svelte/icons/search';
	import X from '@lucide/svelte/icons/x';
	import type { AccessSystemEntry, AccessSystems, PickerLabel, PickerSystem } from './access-types.ts';

	interface Props {
		value: AccessSystems;
		systems: PickerSystem[];
		tags?: PickerLabel[];
		groups?: PickerLabel[];
	}

	let { value = $bindable(), systems, tags = [], groups = [] }: Props = $props();

	const PAGE_SIZE = 150;

	//* Per-system UI state, keyed by systemRef. Kept out of `value` so typing
	//* in a search box never touches the access payload.
	let expanded = $state<Record<number, boolean>>({});
	let search = $state<Record<number, string>>({});
	let limit = $state<Record<number, number>>({});

	const allSystems = $derived(value === '*');

	//* systemRef -> selected talkgroup refs ('*' = all). Rebuilt on every change;
	//* rows read from this so a single checkbox only costs one Set copy.
	const selection = $derived.by(() => {
		const map = new Map<number, '*' | Set<number>>();
		if (value === '*') return map;
		for (const entry of value) map.set(entry.id, entry.talkgroups === '*' ? '*' : new Set(entry.talkgroups));
		return map;
	});

	function entriesFromSelection(map: Map<number, '*' | Set<number>>): AccessSystemEntry[] {
		const entries: AccessSystemEntry[] = [];
		//* Keep configured system order so the payload is stable.
		for (const system of systems) {
			const sel = map.get(system.systemRef);
			if (sel === undefined) continue;
			entries.push({ id: system.systemRef, talkgroups: sel === '*' ? '*' : [...sel].sort((a, b) => a - b) });
		}
		//* Preserve entries for systems that no longer exist in the config.
		for (const [id, sel] of map) {
			if (!systems.some((s) => s.systemRef === id)) entries.push({ id, talkgroups: sel === '*' ? '*' : [...sel] });
		}
		return entries;
	}

	function commit(mutate: (map: Map<number, '*' | Set<number>>) => void) {
		const map = new Map(selection);
		mutate(map);
		value = entriesFromSelection(map);
	}

	function setAllSystems(checked: boolean) {
		if (checked) {
			value = '*';
		} else {
			//* Start from "every system, all talkgroups" so unchecking is additive.
			value = systems.map((s) => ({ id: s.systemRef, talkgroups: '*' as const }));
		}
	}

	function setSystemEnabled(systemRef: number, checked: boolean) {
		commit((map) => {
			if (checked) map.set(systemRef, '*');
			else map.delete(systemRef);
		});
	}

	function setSystemAllTalkgroups(system: PickerSystem, checked: boolean) {
		commit((map) => {
			if (checked) map.set(system.systemRef, '*');
			else map.set(system.systemRef, new Set<number>());
		});
		if (!checked) expanded[system.systemRef] = true;
	}

	function currentSet(system: PickerSystem, map: Map<number, '*' | Set<number>>): Set<number> {
		const sel = map.get(system.systemRef);
		if (sel === '*') return new Set(system.talkgroups.map((tg) => tg.talkgroupRef));
		return new Set(sel ?? []);
	}

	function toggleTalkgroup(system: PickerSystem, talkgroupRef: number, checked: boolean) {
		commit((map) => {
			const set = currentSet(system, map);
			if (checked) set.add(talkgroupRef);
			else set.delete(talkgroupRef);
			map.set(system.systemRef, set);
		});
	}

	function setMany(system: PickerSystem, refs: number[], checked: boolean) {
		commit((map) => {
			const set = currentSet(system, map);
			for (const ref of refs) {
				if (checked) set.add(ref);
				else set.delete(ref);
			}
			map.set(system.systemRef, set);
		});
	}

	function matches(system: PickerSystem) {
		const query = (search[system.systemRef] ?? '').trim().toLowerCase();
		if (!query) return system.talkgroups;
		return system.talkgroups.filter(
			(tg) => tg.label.toLowerCase().includes(query) || tg.name.toLowerCase().includes(query) || String(tg.talkgroupRef).includes(query)
		);
	}

	function visibleRows(system: PickerSystem) {
		const rows = matches(system);
		const max = limit[system.systemRef] ?? PAGE_SIZE;
		return { rows: rows.slice(0, max), total: rows.length, truncated: rows.length > max };
	}

	function selectedCount(system: PickerSystem): number {
		const sel = selection.get(system.systemRef);
		if (sel === undefined) return 0;
		if (sel === '*') return system.talkgroups.length;
		return sel.size;
	}

	function tagRefs(system: PickerSystem, tagId: number): number[] {
		return system.talkgroups.filter((tg) => tg.tagId === tagId).map((tg) => tg.talkgroupRef);
	}

	function groupRefs(system: PickerSystem, groupId: number): number[] {
		return system.talkgroups.filter((tg) => tg.groupIds.includes(groupId)).map((tg) => tg.talkgroupRef);
	}

	//* Only offer tags/groups that actually appear on this system.
	function systemTags(system: PickerSystem): PickerLabel[] {
		const used = new Set(system.talkgroups.map((tg) => tg.tagId));
		return tags.filter((t) => used.has(t.id));
	}

	function systemGroups(system: PickerSystem): PickerLabel[] {
		const used = new Set(system.talkgroups.flatMap((tg) => tg.groupIds));
		return groups.filter((g) => used.has(g.id));
	}
</script>

<div class="flex flex-col gap-3">
	<div class="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2">
		<div>
			<Label class="text-sm font-medium">All systems and talkgroups</Label>
			<p class="text-xs text-muted-foreground">Turn off to restrict access to specific systems or talkgroups.</p>
		</div>
		<Switch checked={allSystems} onCheckedChange={setAllSystems} aria-label="All systems and talkgroups" />
	</div>

	{#if !allSystems}
		{#if systems.length === 0}
			<p class="text-sm text-muted-foreground">No systems are configured yet.</p>
		{:else}
			<div class="flex flex-col gap-2">
				{#each systems as system (system.systemRef)}
					{@const sel = selection.get(system.systemRef)}
					{@const enabled = sel !== undefined}
					{@const allTalkgroups = sel === '*'}
					{@const isOpen = !!expanded[system.systemRef]}
					<div class="rounded-md border border-border">
						<div class="flex flex-wrap items-center gap-3 px-3 py-2">
							<Checkbox
								checked={enabled}
								onCheckedChange={(checked: boolean) => setSystemEnabled(system.systemRef, checked)}
								aria-label={`Include ${system.label}`}
							/>
							<button
								type="button"
								class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left text-sm font-medium disabled:cursor-default"
								disabled={!enabled || allTalkgroups}
								onclick={() => (expanded[system.systemRef] = !isOpen)}
							>
								<span class="truncate">{system.label}</span>
								<Badge variant="secondary" class="font-normal">
									{#if !enabled}
										No access
									{:else if allTalkgroups}
										All {system.talkgroups.length} talkgroups
									{:else}
										{selectedCount(system)} of {system.talkgroups.length}
									{/if}
								</Badge>
								{#if enabled && !allTalkgroups}
									<ChevronRight class={['size-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-90']} />
								{/if}
							</button>
							{#if enabled}
								<div class="flex items-center gap-2">
									<Label class="text-xs text-muted-foreground">All talkgroups</Label>
									<Switch
										checked={allTalkgroups}
										onCheckedChange={(checked: boolean) => setSystemAllTalkgroups(system, checked)}
										aria-label={`All talkgroups for ${system.label}`}
									/>
								</div>
							{/if}
						</div>

						{#if enabled && !allTalkgroups && isOpen}
							{@const view = visibleRows(system)}
							{@const selectedSet = sel instanceof Set ? sel : new Set<number>()}
							<div class="flex flex-col gap-2 border-t border-border px-3 py-2">
								<div class="flex flex-wrap items-center gap-2">
									<div class="relative min-w-48 flex-1">
										<Search class="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
										<Input
											class="h-8 pl-8 text-sm"
											placeholder="Search talkgroups"
											value={search[system.systemRef] ?? ''}
											oninput={(e: Event) => {
												search[system.systemRef] = (e.currentTarget as HTMLInputElement).value;
												limit[system.systemRef] = PAGE_SIZE;
											}}
										/>
										{#if search[system.systemRef]}
											<button
												type="button"
												class="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
												aria-label="Clear search"
												onclick={() => (search[system.systemRef] = '')}
											>
												<X class="size-4" />
											</button>
										{/if}
									</div>
									<Button
										variant="outline"
										size="sm"
										onclick={() =>
											setMany(
												system,
												matches(system).map((tg) => tg.talkgroupRef),
												true
											)}
									>
										Select {search[system.systemRef] ? 'matching' : 'all'}
									</Button>
									<Button
										variant="outline"
										size="sm"
										onclick={() =>
											setMany(
												system,
												matches(system).map((tg) => tg.talkgroupRef),
												false
											)}
									>
										Clear {search[system.systemRef] ? 'matching' : 'all'}
									</Button>
									{#if systemTags(system).length > 0 || systemGroups(system).length > 0}
										<DropdownMenu.Root>
											<DropdownMenu.Trigger>
												{#snippet child({ props })}
													<Button {...props} variant="outline" size="sm">
														<ListChecks data-icon="inline-start" />
														By tag / group
													</Button>
												{/snippet}
											</DropdownMenu.Trigger>
											<DropdownMenu.Content class="max-h-80 overflow-y-auto" align="start">
												{#if systemTags(system).length > 0}
													<DropdownMenu.Group>
														<DropdownMenu.GroupHeading>Tags</DropdownMenu.GroupHeading>
														{#each systemTags(system) as tag (tag.id)}
															{@const refs = tagRefs(system, tag.id)}
															{@const allOn = refs.every((r) => selectedSet.has(r))}
															<DropdownMenu.CheckboxItem
																checked={allOn}
																closeOnSelect={false}
																onCheckedChange={(checked: boolean) => setMany(system, refs, checked)}
															>
																{tag.label}
																<span class="ml-auto pl-3 text-xs text-muted-foreground">{refs.length}</span>
															</DropdownMenu.CheckboxItem>
														{/each}
													</DropdownMenu.Group>
												{/if}
												{#if systemGroups(system).length > 0}
													{#if systemTags(system).length > 0}
														<DropdownMenu.Separator />
													{/if}
													<DropdownMenu.Group>
														<DropdownMenu.GroupHeading>Talkgroup groups</DropdownMenu.GroupHeading>
														{#each systemGroups(system) as group (group.id)}
															{@const refs = groupRefs(system, group.id)}
															{@const allOn = refs.every((r) => selectedSet.has(r))}
															<DropdownMenu.CheckboxItem
																checked={allOn}
																closeOnSelect={false}
																onCheckedChange={(checked: boolean) => setMany(system, refs, checked)}
															>
																{group.label}
																<span class="ml-auto pl-3 text-xs text-muted-foreground">{refs.length}</span>
															</DropdownMenu.CheckboxItem>
														{/each}
													</DropdownMenu.Group>
												{/if}
											</DropdownMenu.Content>
										</DropdownMenu.Root>
									{/if}
								</div>

								{#if view.total === 0}
									<p class="py-2 text-sm text-muted-foreground">No talkgroups match.</p>
								{:else}
									<div class="max-h-80 overflow-y-auto rounded-md border border-border">
										<ul class="divide-y divide-border">
											{#each view.rows as tg (tg.talkgroupRef)}
												<li>
													<label class="flex cursor-pointer items-center gap-3 px-3 py-1.5 text-sm hover:bg-muted/50">
														<Checkbox
															checked={selectedSet.has(tg.talkgroupRef)}
															onCheckedChange={(checked: boolean) => toggleTalkgroup(system, tg.talkgroupRef, checked)}
															aria-label={tg.label}
														/>
														<span class="min-w-0 flex-1 truncate">
															<span class="font-medium">{tg.label}</span>
															{#if tg.name && tg.name !== tg.label}
																<span class="text-muted-foreground"> {tg.name}</span>
															{/if}
														</span>
														<span class="shrink-0 font-mono text-xs text-muted-foreground">{tg.talkgroupRef}</span>
													</label>
												</li>
											{/each}
										</ul>
										{#if view.truncated}
											<div class="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted-foreground">
												<span>Showing {view.rows.length} of {view.total}</span>
												<Button
													variant="ghost"
													size="sm"
													onclick={() => (limit[system.systemRef] = (limit[system.systemRef] ?? PAGE_SIZE) + PAGE_SIZE)}
												>
													Show more
												</Button>
											</div>
										{/if}
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>
