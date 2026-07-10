<script lang="ts" generics="TData">
	//* ============================================================================
	//* Imports
	//* ============================================================================
	import type { ComponentProps } from 'svelte';
	import type { Column } from '@tanstack/table-core';
	import ArrowUpNarrowWide from '@lucide/svelte/icons/arrow-up-narrow-wide';
	import ArrowDownWideNarrow from '@lucide/svelte/icons/arrow-down-wide-narrow';
	import { Button } from '$lib/components/ui/button';

	//* ============================================================================
	//* Types
	//* ============================================================================
	type Props = {
		text: string;
		column: Column<TData, unknown>;
	} & ComponentProps<typeof Button>;

	//* ============================================================================
	//* Props
	//* ============================================================================
	let { text, column, variant = 'ghost', ...restProps }: Props = $props();

	//* ============================================================================
	//* Derived State - Check if this column is sorted
	//* ============================================================================
	const isSorted = $derived(column.getIsSorted());
</script>

<!--* ============================================================================ -->
<!--* Header Button -->
<!--* ============================================================================ -->
<Button {variant} {...restProps} class="w-full justify-start px-4">
	<span class="flex items-center gap-2">
		{text}
		{#if isSorted === 'desc'}
			<ArrowDownWideNarrow class="size-4 shrink-0" />
		{:else if isSorted === 'asc'}
			<ArrowUpNarrowWide class="size-4 shrink-0" />
		{:else}
			<span class="size-4 shrink-0"></span>
		{/if}
	</span>
</Button>
