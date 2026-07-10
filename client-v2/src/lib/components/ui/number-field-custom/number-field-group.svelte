<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils/utils';
	import type { HTMLAttributes } from 'svelte/elements';
	import { useNumberFieldInput } from '$lib/components/ui/number-field-custom/number-field.svelte.ts';

	let { ref = $bindable(null), class: className, children, ...rest }: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();

	const buttonBorders = cn(
		'[&>[data-slot=number-field-decrement]+[data-slot=number-field-increment]]:border-s',
		'[&>[data-slot=number-field-decrement]+[data-slot=number-field-increment]]:border-border',
		'[&>[data-slot=number-field-increment]+[data-slot=number-field-decrement]]:border-s',
		'[&>[data-slot=number-field-increment]+[data-slot=number-field-decrement]]:border-border',
		'aria-invalid:[&>[data-slot=number-field-decrement]+[data-slot=number-field-increment]]:!border-destructive',
		'aria-invalid:[&>[data-slot=number-field-increment]+[data-slot=number-field-decrement]]:!border-destructive'
	);

	const groupState = useNumberFieldInput();
</script>

<div
	bind:this={ref}
	class={cn(
		'flex h-9 w-full items-center overflow-visible rounded-md border border-border',
		'*:data-[slot=number-field-increment]:rounded-end *:data-[slot=number-field-increment]:rounded-none *:data-[slot=number-field-increment]:focus-visible:ring-0',
		'*:data-[slot=number-field-decrement]:rounded-start *:data-[slot=number-field-decrement]:rounded-none *:data-[slot=number-field-decrement]:focus-visible:ring-0',
		'*:data-[slot=number-field-input]:rounded-none *:data-[slot=number-field-input]:border-x *:data-[slot=number-field-input]:border-y-0 *:data-[slot=number-field-input]:first:border-s-0 *:data-[slot=number-field-input]:last:border-e-0',
		'aria-invalid:border-destructive',
		buttonBorders,
		className
	)}
	aria-invalid={!groupState.rootState.valid}
	{...rest}
>
	{@render children?.()}
</div>
