<script lang="ts">
	import { box } from 'svelte-toolbelt';
	import type { NumberFieldRootProps } from '$lib/components/ui/number-field-custom/types';
	import { useNumberField } from '$lib/components/ui/number-field-custom/number-field.svelte.js';

	let {
		value = $bindable('0'),
		step = 1,
		shiftStep = step,
		min,
		max,
		rampSettings = { startDelay: 400, rampUpTime: 0, minFrequency: 35, maxFrequency: 35 },
		id,
		children
	}: NumberFieldRootProps = $props();

	useNumberField({
		value: box.with(
			() => value,
			(v) => (value = v)
		),
		step: box.with(() => step),
		shiftStep: box.with(() => shiftStep),
		min: box.with(() => min),
		max: box.with(() => max),
		rampSettings: box.with(() => rampSettings),
		id: box.with(() => id)
	});
</script>

{@render children?.()}
