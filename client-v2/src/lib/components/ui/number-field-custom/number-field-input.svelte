<script lang="ts">
	import { cn } from '$lib/utils/utils.js';
	import { useNumberFieldInput } from '$lib/components/ui/number-field-custom/number-field.svelte.js';
	import type { NumberFieldInputProps } from '$lib/components/ui/number-field-custom/types.js';

	let { ref = $bindable(null), class: className, ...rest }: NumberFieldInputProps = $props();

	const inputState = useNumberFieldInput();
</script>

<input
	class={cn('h-9 min-w-0 flex-1 rounded-md border border-border px-4 text-center outline-none aria-invalid:border-destructive', className)}
	bind:this={ref}
	data-slot="number-field-input"
	bind:value={inputState.rootState.opts.value.current}
	{...inputState.props}
	{...rest}
/>

<style>
	input[type='text'] {
		appearance: none;
		-moz-appearance: textfield;
	}

	input[type='text']::-webkit-outer-spin-button,
	input[type='text']::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}
</style>
