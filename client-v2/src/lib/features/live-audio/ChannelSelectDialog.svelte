<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ListPlus from '@lucide/svelte/icons/list-plus';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Save from '@lucide/svelte/icons/save';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	import { getTlrClient } from '$lib/core/context.ts';
	import { ScanListsState } from './ScanListsState.svelte.ts';
	import type { AudioPlayerState } from './AudioPlayerState.svelte.ts';
	import { normalizeConfigSystems, type TlrConfig, type TlrConfigTalkgroup, type LivefeedMap } from '$lib/core/types.ts';

	let {
		open = $bindable(false),
		player,
		config
	}: {
		open: boolean;
		player: AudioPlayerState;
		config: TlrConfig | null;
	} = $props();

	let systems = $derived(normalizeConfigSystems(config));

	const client = getTlrClient();
	const scanLists = new ScanListsState(client);

	//* Keep presets in sync with the server-pushed config; fetch once as a fallback
	$effect(() => {
		scanLists.syncFromConfig(config);
	});
	$effect(() => {
		if (open) void scanLists.loadIfNeeded();
	});
	//* Flush any pending debounced save when the dialog unmounts
	$effect(() => {
		return () => scanLists.flush();
	});

	let newListName = $state('');
	let renamingId = $state<string | null>(null);
	let renameValue = $state('');

	const hasSelection = $derived.by(() => {
		for (const talkgroups of Object.values(player.selectedTalkgroups)) {
			for (const enabled of Object.values(talkgroups)) {
				if (enabled) return true;
			}
		}
		return false;
	});

	function createList() {
		const name = newListName.trim();
		if (!name || !hasSelection) return;
		scanLists.saveCurrentSelection(name, player.selectedTalkgroups, config);
		newListName = '';
	}

	function applyList(id: string) {
		const list = scanLists.lists.find((l) => l.id === id);
		if (!list) return;
		player.replaceSelection(scanLists.toLivefeedMap(list));
	}

	function startRename(id: string, currentName: string) {
		renamingId = id;
		renameValue = currentName;
	}

	function commitRename() {
		if (renamingId) scanLists.rename(renamingId, renameValue);
		renamingId = null;
	}

	function groupByGroup(systemRef: string, talkgroups: TlrConfigTalkgroup[]): Map<string, TlrConfigTalkgroup[]> {
		const groupMap = config?.groups;
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const result = new Map<string, TlrConfigTalkgroup[]>();

		if (groupMap) {
			// Build a lookup from talkgroup ref → all group names it belongs to
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			const tgToGroups = new Map<number, string[]>();
			for (const [groupName, systemMap] of Object.entries(groupMap)) {
				const tgRefs = systemMap[systemRef];
				if (tgRefs) {
					for (const ref of tgRefs) {
						const names = tgToGroups.get(ref) ?? [];
						names.push(groupName);
						tgToGroups.set(ref, names);
					}
				}
			}

			for (const tg of talkgroups) {
				const ref = tg.talkgroupRef ?? tg.id ?? 0;
				const groupNames = tgToGroups.get(ref) ?? ['Other'];
				for (const groupName of groupNames) {
					const list = result.get(groupName) ?? [];
					list.push(tg);
					result.set(groupName, list);
				}
			}
		} else {
			// Fallback to tag if groups not available
			for (const tg of talkgroups) {
				const tag = tg.tag || 'Other';
				const list = result.get(tag) ?? [];
				list.push(tg);
				result.set(tag, list);
			}
		}

		// Sort groups alphabetically
		return new Map([...result.entries()].sort((a, b) => a[0].localeCompare(b[0])));
	}

	function countSelected(systemRef: string, tgRefs: string[], selected: LivefeedMap): number {
		const system = selected[systemRef];
		if (!system) return 0;
		return tgRefs.filter((ref) => system[ref]).length;
	}

	function getSystemRef(system: { systemRef?: number; id?: number }): string {
		return String(system.systemRef ?? system.id);
	}

	function getTgRef(tg: { talkgroupRef?: number; id?: number }): string {
		return String(tg.talkgroupRef ?? tg.id);
	}

	function getAllTgRefs(talkgroups: TlrConfigTalkgroup[]): string[] {
		return talkgroups.map((tg) => getTgRef(tg));
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="flex h-[80vh] max-h-175 w-[95vw] max-w-none! flex-col lg:w-[70vw] xl:w-[60vw]">
		<Dialog.Header>
			<Dialog.Title class="text-lg">Channel Select</Dialog.Title>
			<Dialog.Description>Select talkgroups to monitor for live audio</Dialog.Description>
		</Dialog.Header>

		<div class="flex-1 space-y-3 overflow-y-auto pr-1">
			<div class="rounded-lg border border-border">
				<div class="flex items-center gap-2.5 px-4 py-3">
					<ListPlus class="size-5 shrink-0 text-muted-foreground" />
					<span class="text-base font-medium">Scan Lists</span>
					{#if scanLists.saveError}
						<span class="ml-auto truncate text-xs text-destructive">Save failed: {scanLists.saveError}</span>
					{/if}
				</div>
				<div class="space-y-2 px-4 pb-3">
					{#each scanLists.lists as list (list.id)}
						<div class="flex items-center gap-2 rounded-md border border-border/50 px-3 py-2">
							{#if renamingId === list.id}
								<Input
									class="h-8 flex-1"
									bind:value={renameValue}
									onkeydown={(e: KeyboardEvent) => {
										if (e.key === 'Enter') commitRename();
										if (e.key === 'Escape') renamingId = null;
									}}
									onblur={commitRename}
								/>
							{:else}
								<button class="flex flex-1 cursor-pointer items-center gap-2 text-left text-sm font-medium" onclick={() => applyList(list.id)}>
									<span class="truncate">{list.name}</span>
									<Badge variant="outline" class="px-2 py-0.5 text-xs tabular-nums">{list.channels.length}</Badge>
								</button>
								<Button variant="ghost" size="sm" class="h-7 px-2.5 text-xs" onclick={() => applyList(list.id)}>Apply</Button>
								<Button
									variant="ghost"
									size="icon"
									class="size-7"
									title="Overwrite with current selection"
									disabled={!hasSelection}
									onclick={() => scanLists.updateChannels(list.id, player.selectedTalkgroups, config)}
								>
									<Save class="size-3.5" />
								</Button>
								<Button variant="ghost" size="icon" class="size-7" title="Rename" onclick={() => startRename(list.id, list.name)}>
									<Pencil class="size-3.5" />
								</Button>
								<Button variant="ghost" size="icon" class="size-7 text-destructive" title="Delete" onclick={() => scanLists.remove(list.id)}>
									<Trash2 class="size-3.5" />
								</Button>
							{/if}
						</div>
					{:else}
						<p class="px-1 text-sm text-muted-foreground">No saved scan lists yet. Select channels below, then save them as a preset.</p>
					{/each}

					<div class="flex items-center gap-2 pt-1">
						<Input
							class="h-8 flex-1"
							placeholder="New scan list name"
							bind:value={newListName}
							onkeydown={(e: KeyboardEvent) => {
								if (e.key === 'Enter') createList();
							}}
						/>
						<Button variant="secondary" size="sm" class="h-8 px-3 text-sm" disabled={!newListName.trim() || !hasSelection} onclick={createList}>
							Save current
						</Button>
					</div>
				</div>
			</div>

			{#each systems as system (system.id ?? system.systemRef)}
				{@const systemRef = getSystemRef(system)}
				{@const talkgroups = system.talkgroups ?? []}
				{@const allTgRefs = getAllTgRefs(talkgroups)}
				{@const systemSelectedCount = countSelected(systemRef, allTgRefs, player.selectedTalkgroups)}
				{@const tagGroups = groupByGroup(systemRef, talkgroups)}

				<Collapsible.Root class="rounded-lg border border-border">
					<div class="flex items-center gap-3 px-4 py-3">
						<Collapsible.Trigger class="flex flex-1 cursor-pointer items-center gap-2.5 text-base font-medium [&[data-state=open]>svg]:rotate-90">
							<ChevronRight class="size-5 shrink-0 transition-transform duration-200" />
							<span class="truncate">{system.label ?? systemRef}</span>
							<Badge variant="secondary" class="ml-auto px-2 py-0.5 text-sm tabular-nums">
								{systemSelectedCount}/{talkgroups.length}
							</Badge>
						</Collapsible.Trigger>
						<Button variant="ghost" size="sm" class="h-8 px-3 text-sm" onclick={() => player.setAllForSystem(systemRef, allTgRefs, true)}>
							Select All
						</Button>
						<Button variant="ghost" size="sm" class="h-8 px-3 text-sm" onclick={() => player.setAllForSystem(systemRef, allTgRefs, false)}>
							Clear
						</Button>
					</div>

					<Collapsible.Content class="space-y-2 px-4 pb-3">
						{#each [...tagGroups] as [tag, groupTalkgroups] (tag)}
							{@const groupTgRefs = getAllTgRefs(groupTalkgroups)}
							{@const groupSelectedCount = countSelected(systemRef, groupTgRefs, player.selectedTalkgroups)}

							<Collapsible.Root class="rounded-md border border-border/50">
								<div class="flex items-center gap-2.5 px-3 py-2.5">
									<Collapsible.Trigger class="flex flex-1 cursor-pointer items-center gap-2 text-sm font-medium [&[data-state=open]>svg]:rotate-90">
										<ChevronRight class="size-4 shrink-0 transition-transform duration-200" />
										<span class="truncate text-muted-foreground">{tag}</span>
										<Badge variant="outline" class="ml-auto px-2 py-0.5 text-xs">
											{groupSelectedCount}/{groupTalkgroups.length}
										</Badge>
									</Collapsible.Trigger>
									<Button variant="ghost" size="sm" class="h-7 px-2.5 text-xs" onclick={() => player.setAllForGroup(systemRef, groupTgRefs, true)}>
										All
									</Button>
									<Button variant="ghost" size="sm" class="h-7 px-2.5 text-xs" onclick={() => player.setAllForGroup(systemRef, groupTgRefs, false)}>
										Clear
									</Button>
								</div>

								<Collapsible.Content class="space-y-1 px-3 pb-2.5">
									{#each groupTalkgroups as tg (tg.id ?? tg.talkgroupRef)}
										{@const tgRef = getTgRef(tg)}
										{@const isChecked = player.selectedTalkgroups[systemRef]?.[tgRef] ?? false}

										<label class="flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-sm hover:bg-muted/50">
											<Checkbox checked={isChecked} onCheckedChange={() => player.toggleTalkgroup(systemRef, tgRef)} />
											<span class="font-medium">{tg.label ?? tgRef}</span>
											{#if tg.name}
												<span class="text-muted-foreground">{tg.name}</span>
											{/if}
										</label>
									{/each}
								</Collapsible.Content>
							</Collapsible.Root>
						{/each}
					</Collapsible.Content>
				</Collapsible.Root>
			{/each}

			{#if systems.length === 0}
				<p class="py-4 text-center text-sm text-muted-foreground">No systems available. Waiting for configuration...</p>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
