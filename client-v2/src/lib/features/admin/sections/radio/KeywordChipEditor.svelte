<script lang="ts">
	//* Chip editor for a keyword list. Matching on the server is case-insensitive
	//* whole-word, so keywords are stored uppercased and deduped. Enter, comma,
	//* or blur adds; pasting multi-line or comma-separated text adds many.
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';

	interface Props {
		items: string[];
	}

	let { items = $bindable() }: Props = $props();

	let text = $state('');

	export function normalizeKeywords(raw: string[]): string[] {
		const out: string[] = [];
		const seen = new Set<string>();
		for (const value of raw) {
			const keyword = value.toUpperCase().trim();
			if (!keyword || seen.has(keyword)) continue;
			seen.add(keyword);
			out.push(keyword);
		}
		return out;
	}

	function addMany(values: string[]) {
		items = normalizeKeywords([...items, ...values]);
	}

	function addFromInput() {
		const value = text;
		text = '';
		addMany(value.split(/[,\n]/));
	}

	function remove(index: number) {
		items = items.filter((_, i) => i !== index);
	}

	function onPaste(event: ClipboardEvent) {
		const pasted = event.clipboardData?.getData('text') ?? '';
		if (!/[,\n]/.test(pasted)) return;
		event.preventDefault();
		addMany(pasted.split(/[,\n]/));
	}
</script>

<div class="flex flex-col gap-2">
	<div class="flex items-center gap-2">
		<Input
			class="h-8 max-w-sm"
			placeholder="Type a keyword and press Enter"
			bind:value={text}
			onkeydown={(event: KeyboardEvent) => {
				if (event.key === 'Enter' || event.key === ',') {
					event.preventDefault();
					addFromInput();
				}
			}}
			onblur={addFromInput}
			onpaste={onPaste}
		/>
		<Button variant="outline" size="sm" disabled={text.trim().length === 0} onclick={addFromInput}>
			<Plus data-icon="inline-start" />
			Add
		</Button>
	</div>
	{#if items.length === 0}
		<p class="text-xs text-muted-foreground">No keywords yet. Type above, paste a list, or import a file.</p>
	{:else}
		<div class="flex flex-wrap gap-1">
			{#each items as item, index (item)}
				<Badge variant="secondary" class="gap-1 pr-1 font-mono text-[11px]">
					{item}
					<button type="button" class="rounded-sm p-0.5 hover:bg-muted-foreground/20" aria-label={`Remove ${item}`} onclick={() => remove(index)}>
						<X class="size-3" />
					</button>
				</Badge>
			{/each}
		</div>
	{/if}
</div>
