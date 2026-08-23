<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';
	import { cn } from '$lib/utils/shadcn.ts';
	import Check from '@lucide/svelte/icons/check';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import X from '@lucide/svelte/icons/x';

	export interface SearchableOption {
		value: number;
		label: string;
		hint?: string;
	}

	interface Props {
		options: SearchableOption[];
		value?: number;
		placeholder?: string;
		searchPlaceholder?: string;
		disabled?: boolean;
		clearable?: boolean;
		maxResults?: number;
		id?: string;
		class?: string;
		onchange?: (value: number | undefined) => void;
	}

	let {
		options,
		value = $bindable(undefined),
		placeholder = 'Select...',
		searchPlaceholder = 'Search...',
		disabled = false,
		clearable = true,
		maxResults = 200,
		id,
		class: className,
		onchange
	}: Props = $props();

	let open = $state(false);
	let search = $state('');

	const selected = $derived(options.find((option) => option.value === value));

	//* Manual filtering keeps the rendered list bounded for very large option sets.
	const matches = $derived.by(() => {
		const query = search.trim().toLowerCase();
		if (!query) return options;
		return options.filter((option) => option.label.toLowerCase().includes(query) || (option.hint ?? '').toLowerCase().includes(query));
	});
	const filtered = $derived(matches.slice(0, maxResults));
	const hiddenCount = $derived(matches.length - filtered.length);

	function choose(next: number | undefined) {
		value = next;
		onchange?.(next);
		open = false;
		search = '';
	}
</script>

<Popover.Root bind:open onOpenChange={(isOpen) => (isOpen ? undefined : (search = ''))}>
	<Popover.Trigger {id} {disabled}>
		{#snippet child({ props })}
			<Button {...props} variant="outline" size="sm" role="combobox" aria-expanded={open} class={cn('w-full justify-between font-normal', className)}>
				<span class={cn('truncate', !selected && 'text-muted-foreground')}>{selected ? selected.label : placeholder}</span>
				<span class="flex shrink-0 items-center gap-1">
					{#if clearable && selected && !disabled}
						<span
							role="button"
							tabindex="-1"
							aria-label="Clear selection"
							class="rounded-sm opacity-60 hover:opacity-100"
							onclick={(e: MouseEvent) => {
								e.stopPropagation();
								choose(undefined);
							}}
							onkeydown={(e: KeyboardEvent) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									e.stopPropagation();
									choose(undefined);
								}
							}}
						>
							<X class="size-3.5" />
						</span>
					{/if}
					<ChevronsUpDown class="size-3.5 opacity-60" />
				</span>
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-(--bits-popover-anchor-width) min-w-64 p-0" align="start">
		<Command.Root shouldFilter={false}>
			<Command.Input placeholder={searchPlaceholder} bind:value={search} />
			<Command.List class="max-h-64">
				<Command.Empty>No matches.</Command.Empty>
				<Command.Group>
					{#each filtered as option (option.value)}
						<Command.Item value={String(option.value)} onSelect={() => choose(option.value)}>
							<Check class={cn('size-4', option.value === value ? 'opacity-100' : 'opacity-0')} />
							<span class="truncate">{option.label}</span>
							{#if option.hint}
								<span class="ml-auto pl-2 text-xs text-muted-foreground">{option.hint}</span>
							{/if}
						</Command.Item>
					{/each}
				</Command.Group>
				{#if hiddenCount > 0}
					<div class="border-t border-border px-2 py-1.5 text-xs text-muted-foreground">
						Showing {filtered.length.toLocaleString()} of {matches.length.toLocaleString()}. Type to narrow the list.
					</div>
				{/if}
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
