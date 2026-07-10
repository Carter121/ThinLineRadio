<script lang="ts">
	import type { UseRampOptions } from '$lib/hooks/use-ramp.svelte.ts';
	import {
		CustomNumberField,
		CustomNumberFieldDecrement,
		CustomNumberFieldGroup,
		CustomNumberFieldIncrement,
		CustomNumberFieldInput
	} from '$lib/components/ui/number-field-custom/index.ts';

	type NumberFieldWrapperProps = {
		value?: string | number;
		step?: number;
		shiftStep?: number;
		min?: number;
		max?: number;
		rampSettings?: Omit<UseRampOptions, 'increment' | 'canRamp'>;
		id?: string;
		reset?: () => void;
	};

	let {
		value = $bindable(0),
		step = 1,
		shiftStep = step,
		min,
		max = Number.MAX_SAFE_INTEGER,
		rampSettings = { startDelay: 400, rampUpTime: 0, minFrequency: 35, maxFrequency: 35 },
		id,
		reset = $bindable()
	}: NumberFieldWrapperProps = $props();

	/** Number of decimal places implied by the step */
	const decimals = $derived(step < 1 ? Math.max(0, Math.ceil(-Math.log10(step))) : 0);

	function pad(v: number | string): string {
		const n = Number(v);
		return isNaN(n) ? String(v) : n.toFixed(decimals);
	}

	let valueAsString = $state(pad(value));
	let localInputUpdate = $state(false);
	let focusedWithin = $state(false);

	$effect(() => {
		void value;

		if (localInputUpdate) {
			localInputUpdate = false;
			return;
		}

		if (focusedWithin) return;

		valueAsString = pad(value);
	});

	reset = () => {
		value = 0;
		valueAsString = pad(0);
	};

	let wrapperEl: HTMLDivElement;

	function handleFocusIn() {
		focusedWithin = true;
	}

	function handleFocusOut(e: FocusEvent) {
		// Only pad when focus leaves the entire component, not when moving between input and buttons
		if (e.relatedTarget instanceof Node && wrapperEl?.contains(e.relatedTarget)) return;
		focusedWithin = false;
		valueAsString = pad(value);
	}
</script>

<div bind:this={wrapperEl} onfocusin={handleFocusIn} onfocusout={handleFocusOut}>
	<CustomNumberField
		bind:value={
			() => valueAsString,
			(v) => {
				localInputUpdate = true;
				valueAsString = v;
				value = Number(v);
			}
		}
		{step}
		{shiftStep}
		{min}
		{max}
		{rampSettings}
		{id}
	>
		<CustomNumberFieldGroup>
			<CustomNumberFieldInput />
			<CustomNumberFieldDecrement />
			<CustomNumberFieldIncrement />
		</CustomNumberFieldGroup>
	</CustomNumberField>
</div>
