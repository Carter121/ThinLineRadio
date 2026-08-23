<script lang="ts">
	//* Searchable multi-select over {id, label} rows (tags, talkgroup groups).
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '$lib/components/ui/command';
	import { Popover, PopoverContent, PopoverTrigger } from '$lib/components/ui/popover';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import X from '@lucide/svelte/icons/x';

	interface Item {
		id: number;
		label: string;
	}

	interface Props {
		items: Item[];
		value: number[];
		onchange: (ids: number[]) => void;
		placeholder?: string;
		class?: string;
	}

	let { items, value, onchange, placeholder = 'Select', class: className = '' }: Props = $props();

	let open = $state(false);
	const selected = $derived(new Set(value));
	const selectedItems = $derived(items.filter((item) => selected.has(item.id)));

	function toggle(id: number) {
		onchange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id]);
	}
</script>

<Popover bind:open>
	<PopoverTrigger>
		{#snippet child({ props })}
			<Button variant="outline" size="sm" class="h-auto min-h-8 w-full justify-between gap-2 px-2 py-1 font-normal {className}" {...props}>
				<span class="flex flex-wrap gap-1">
					{#if selectedItems.length === 0}
						<span class="text-muted-foreground">{placeholder}</span>
					{:else}
						{#each selectedItems as item (item.id)}
							<Badge variant="secondary" class="gap-1 pr-1 text-xs">
								{item.label}
								<span
									role="button"
									tabindex="-1"
									class="rounded-sm hover:bg-muted"
									aria-label="Remove {item.label}"
									onclick={(event) => {
										event.stopPropagation();
										toggle(item.id);
									}}
									onkeydown={(event) => {
										if (event.key === 'Enter') toggle(item.id);
									}}
								>
									<X class="size-3" />
								</span>
							</Badge>
						{/each}
					{/if}
				</span>
				<ChevronsUpDown class="size-3.5 shrink-0 opacity-50" />
			</Button>
		{/snippet}
	</PopoverTrigger>
	<PopoverContent class="w-64 p-0" align="start">
		<Command>
			<CommandInput placeholder="Search" />
			<CommandList class="max-h-60">
				<CommandEmpty>No matches.</CommandEmpty>
				<CommandGroup>
					{#each items as item (item.id)}
						<CommandItem value={item.label} onSelect={() => toggle(item.id)}>
							<Checkbox checked={selected.has(item.id)} class="pointer-events-none" />
							<span class="truncate">{item.label}</span>
						</CommandItem>
					{/each}
				</CommandGroup>
			</CommandList>
		</Command>
	</PopoverContent>
</Popover>
