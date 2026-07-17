<script lang="ts">
	//* Inline chip editor for a list of uppercase words (aliases, reject words).
	//* Mutates the bound array in place; the parent owns the reactive state.
	import { Badge } from '$lib/components/ui/badge';
	import X from '@lucide/svelte/icons/x';

	interface Props {
		items: string[];
		placeholder?: string;
		onchange?: () => void;
	}

	let { items = $bindable(), placeholder = 'Add...', onchange }: Props = $props();

	let text = $state('');

	//* Reassigns instead of mutating so function bindings (getter/setter pairs)
	//* propagate the change back to the parent row.
	function add() {
		const value = text.toUpperCase().trim();
		text = '';
		if (!value || items.includes(value)) return;
		items = [...items, value];
		onchange?.();
	}

	function remove(index: number) {
		items = items.filter((_, i) => i !== index);
		onchange?.();
	}
</script>

<div class="flex min-w-40 flex-wrap items-center gap-1">
	{#each items as item, index (item)}
		<Badge variant="secondary" class="gap-1 pr-1 font-mono text-[11px]">
			{item}
			<button type="button" class="rounded-sm p-0.5 hover:bg-muted-foreground/20" aria-label={`Remove ${item}`} onclick={() => remove(index)}>
				<X class="size-3" />
			</button>
		</Badge>
	{/each}
	<input
		class="h-6 w-24 min-w-0 flex-1 rounded-sm border border-transparent bg-transparent px-1 text-xs outline-none placeholder:text-muted-foreground/70 focus:border-border"
		{placeholder}
		bind:value={text}
		onkeydown={(e: KeyboardEvent) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				add();
			}
		}}
		onblur={add}
	/>
</div>
