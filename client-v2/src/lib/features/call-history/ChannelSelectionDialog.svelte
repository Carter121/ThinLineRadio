<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Field from '$lib/components/ui/field';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ListFilter from '@lucide/svelte/icons/list-filter';
	import FavoriteStar from './FavoriteStar.svelte';
	import { cn } from '$lib/utils/shadcn';
	import { channelKey, selectionSummary, type ChannelChoice, type ChannelSelection } from './channel-selection.ts';
	import type { CallHistoryState } from './CallHistoryState.svelte.ts';

	let { state: history }: { state: CallHistoryState } = $props();
	let open = $state(false);
	let draft = $state<ChannelSelection>({ groups: [], channels: [] });
	let search = $state('');
	let expanded = $state<string[]>([]);
	const id = $props.id();
	const query = $derived(search.trim().toLocaleLowerCase());
	const explicitKeys = $derived(new Set(draft.channels.map(channelKey)));
	const scoped = $derived(history.channelChoices.filter((choice) => history.systemFilter == null || choice.system === history.systemFilter));
	const allGroups = $derived([...new Set([...Object.keys(history.config?.groups ?? {}), ...draft.groups])].sort((a, b) => a.localeCompare(b)));
	const favoriteGroups = ['SLC FD', 'SLC FD Abnormal', 'VECC', 'VECC Abnormal'];
	const orderedGroups = $derived(
		[...allGroups].sort((a, b) => Number(favoriteGroups.includes(b)) - Number(favoriteGroups.includes(a)) || a.localeCompare(b))
	);
	const missingChannels = $derived(draft.channels.filter((channel) => !scoped.some((choice) => choice.key === channelKey(channel))));
	const summary = $derived(selectionSummary(draft, history.channelChoices));

	function changeOpen(value: boolean) {
		if (value) {
			draft = structuredClone(history.selection);
			search = '';
			expanded = [];
		}
		open = value;
	}

	function toggleGroup(group: string, checked: boolean) {
		draft.groups = checked ? [...draft.groups, group] : draft.groups.filter((name) => name !== group);
	}

	function toggleChannel(channel: ChannelChoice, checked: boolean) {
		if (channel.groups.some((group) => draft.groups.includes(group))) return;
		draft.channels = checked
			? [...draft.channels, { system: channel.system, talkgroup: channel.talkgroup }]
			: draft.channels.filter((pair) => channelKey(pair) !== channel.key);
	}

	function matches(choice: ChannelChoice) {
		return `${choice.label} ${choice.systemLabel} ${choice.talkgroup}`.toLocaleLowerCase().includes(query);
	}

	function members(group: string) {
		const groupMatches = group.toLocaleLowerCase().includes(query);
		return scoped.filter((choice) => choice.groups.includes(group) && (groupMatches || matches(choice)));
	}

	function systems(choices: ChannelChoice[]) {
		return [...new Set(choices.map((choice) => choice.system))].map((system) => ({
			system,
			label: choices.find((choice) => choice.system === system)!.systemLabel,
			choices: choices.filter((choice) => choice.system === system)
		}));
	}
</script>

{#snippet channelRows(choices: ChannelChoice[], section: string)}
	{#each systems(choices) as system (system.system)}
		<Field.FieldSet class="gap-1">
			<Field.FieldLegend class={cn(history.systemFilter != null && 'sr-only')}>{system.label}</Field.FieldLegend>
			<Field.FieldGroup class="gap-0">
				{#each system.choices as choice (choice.key)}
					{@const inherited = choice.groups.filter((group) => draft.groups.includes(group))}
					<Field.FieldLabel class="min-h-11 py-2" for={`${id}-${section}-${choice.key}`}>
						<Field.Field orientation="horizontal">
							<Checkbox
								id={`${id}-${section}-${choice.key}`}
								checked={explicitKeys.has(choice.key) || inherited.length > 0}
								disabled={inherited.length > 0}
								onCheckedChange={(checked) => toggleChannel(choice, checked)}
							/>
							<Field.FieldContent class="min-w-0">
								<Field.FieldTitle class="break-words">{choice.label}</Field.FieldTitle>
								{#if inherited.length}
									<Field.FieldDescription
										>Included by {inherited.join(', ')}{explicitKeys.has(choice.key) ? '. Also selected individually.' : '.'}</Field.FieldDescription
									>
								{/if}
							</Field.FieldContent>
						</Field.Field>
					</Field.FieldLabel>
				{/each}
			</Field.FieldGroup>
		</Field.FieldSet>
	{/each}
{/snippet}

<Dialog.Root {open} onOpenChange={changeOpen}>
	<Dialog.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="outline" size="sm" class="max-w-64" disabled={!history.config}>
				<ListFilter data-icon="inline-start" />
				<span class="truncate">{history.selectionSummary}</span>
			</Button>
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content class="flex h-[calc(100dvh-1rem)] max-w-[calc(100%-1rem)] flex-col gap-4 p-4 sm:h-[min(85dvh,48rem)] sm:max-w-2xl">
		<Dialog.Header class="shrink-0 pr-6">
			<Dialog.Title>Select channels</Dialog.Title>
			<Dialog.Description
				>Expand a group to choose channels, or check its box to include the whole group. System limits the channels searched.</Dialog.Description
			>
		</Dialog.Header>
		<Field.FieldGroup class="shrink-0 gap-2">
			<Field.Field>
				<Field.FieldLabel for={`${id}-search`}>Find groups or channels</Field.FieldLabel>
				<Input id={`${id}-search`} bind:value={search} placeholder="Search by group, channel, or system" />
			</Field.Field>
		</Field.FieldGroup>
		<div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain pr-1">
			{#if missingChannels.length}
				<Field.FieldSet class="gap-1">
					<Field.FieldLegend>Selected outside this view</Field.FieldLegend>
					{#each missingChannels as channel (channelKey(channel))}
						{@const choice = history.channelChoices.find((item) => item.key === channelKey(channel))}
						<Field.FieldLabel class="min-h-11 py-2">
							<Checkbox
								checked
								onCheckedChange={() => (draft.channels = draft.channels.filter((item) => channelKey(item) !== channelKey(channel)))}
							/>
							<span class="min-w-0 break-words"
								>{choice
									? `${choice.systemLabel} / ${choice.label}: outside the current System scope`
									: `${channelKey(channel)}: unavailable in the current configuration or access`}</span
							>
						</Field.FieldLabel>
					{/each}
				</Field.FieldSet>
			{/if}
			{#if scoped.some((choice) => choice.favorite && matches(choice))}
				<Field.FieldSet class="gap-2">
					<Field.FieldLegend>Favorite channels</Field.FieldLegend>
					{@render channelRows(
						scoped.filter((choice) => choice.favorite && matches(choice)),
						'favorites'
					)}
				</Field.FieldSet>
			{/if}
			{#each orderedGroups.filter((group) => group.toLocaleLowerCase().includes(query) || members(group).length) as group (group)}
				{@const visible = members(group)}
				{@const isExpanded = query.length > 0 || expanded.includes(group)}
				{@const available = Object.hasOwn(history.config?.groups ?? {}, group)}
				<section class="flex flex-col gap-1" aria-label={group}>
					<div class="flex min-h-11 items-center gap-2">
						<Checkbox
							aria-label={`Select entire group ${group}`}
							checked={draft.groups.includes(group)}
							onCheckedChange={(checked) => toggleGroup(group, checked)}
						/>
						<Button
							variant="ghost"
							class="h-auto min-h-11 min-w-0 flex-1 justify-start py-2 text-left whitespace-normal"
							aria-expanded={isExpanded}
							aria-controls={`${id}-group-${encodeURIComponent(group)}`}
							onclick={() => (expanded = isExpanded ? expanded.filter((item) => item !== group) : [...expanded, group])}
						>
							{#if isExpanded}<ChevronDown data-icon="inline-start" />{:else}<ChevronRight data-icon="inline-start" />{/if}
							{#if favoriteGroups.includes(group)}<FavoriteStar />{/if}
							<span class="min-w-0 flex-1 break-words">{group}</span>
							<span>{scoped.filter((choice) => choice.groups.includes(group)).length}</span>
						</Button>
					</div>
					{#if !available}<p class="text-sm text-muted-foreground">Unavailable in the current configuration or access. Uncheck to remove.</p>
					{:else if !scoped.some((choice) => choice.groups.includes(group))}<p class="text-sm text-muted-foreground">
							No available channels in the current System scope.
						</p>{/if}
					{#if isExpanded}
						<div id={`${id}-group-${encodeURIComponent(group)}`} class="flex flex-col gap-2 pl-6">
							{@render channelRows(visible, `group-${encodeURIComponent(group)}`)}
						</div>
					{/if}
				</section>
			{/each}
			{#if scoped.some((choice) => choice.groups.length === 0 && matches(choice))}
				<Field.FieldSet class="gap-2">
					<Field.FieldLegend>Ungrouped</Field.FieldLegend>
					{@render channelRows(
						scoped.filter((choice) => choice.groups.length === 0 && matches(choice)),
						'ungrouped'
					)}
				</Field.FieldSet>
			{/if}
		</div>
		<p class="shrink-0 text-sm text-muted-foreground" aria-live="polite">{summary}</p>
		<Dialog.Footer class="shrink-0 gap-2">
			<Button variant="ghost" onclick={() => (draft = { groups: [], channels: [] })}>Clear</Button>
			<Button variant="outline" onclick={() => changeOpen(false)}>Cancel</Button>
			<Button
				onclick={() => {
					history.applySelection(draft);
					changeOpen(false);
				}}>Apply</Button
			>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
