<script lang="ts">
	import MinusIcon from '@lucide/svelte/icons/minus';
	import { Button } from '$lib/components/ui/button';
	import { useNumberFieldButton } from '$lib/components/ui/number-field-custom/number-field.svelte.js';
	import type { NumberFieldButtonProps } from '$lib/components/ui/number-field-custom/types.js';
	import { cn } from '$lib/utils/utils';
	import { box } from 'svelte-toolbelt';
	let {
		ref = $bindable(null),
		variant = 'ghost',
		size = 'icon',
		class: className,
		children,
		disabled = false,
		onpointerdown,
		onpointerup,
		onpointerleave,
		onpointercancel,
		onclick,
		tabindex = -1,
		...rest
	}: NumberFieldButtonProps = $props();

	const buttonState = useNumberFieldButton({
		direction: 'down',
		onpointerdown: box.with(() => onpointerdown),
		onpointerup: box.with(() => onpointerup),
		onpointerleave: box.with(() => onpointerleave),
		onpointercancel: box.with(() => onpointercancel),
		onclick: box.with(() => onclick),
		disabled: box.with(() => disabled)
	});

	$effect(() => {
		return () => buttonState.destroy();
	});
</script>

<Button
	{variant}
	{size}
	{tabindex}
	bind:ref
	data-slot="number-field-decrement"
	aria-label="Decrease"
	class={cn('touch-manipulation', className)}
	{...buttonState.props}
	{...rest}
>
	{#if children}
		{@render children()}
	{:else}
		<MinusIcon />
	{/if}
</Button>
