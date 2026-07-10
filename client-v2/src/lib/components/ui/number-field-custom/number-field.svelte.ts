// noinspection DuplicatedCode,JSConstantReassignment

import BigNumber from 'bignumber.js';

/** Safely parse a string to BigNumber — returns NaN BigNumber for empty/invalid input instead of throwing */
function safeBN(value: string | number): BigNumber {
	if (value === '' || value === '.' || value === '-' || value === '-.') return new BigNumber(NaN);
	try {
		return new BigNumber(value);
	} catch {
		return new BigNumber(NaN);
	}
}

import { Context, PressedKeys } from 'runed';
import type { ReadableBoxedValues, WritableBoxedValues } from 'svelte-toolbelt';
import type { ButtonElementProps } from '$lib/components/ui/button';
import { useRamp, type UseRampOptions } from '$lib/hooks/use-ramp.svelte';

type NumberFieldRootProps = WritableBoxedValues<{
	value: string;
}> &
	ReadableBoxedValues<{
		step: number;
		shiftStep?: number;
		min?: number;
		max?: number;
		rampSettings: Omit<UseRampOptions, 'increment' | 'canRamp'>;
		id?: string;
	}>;

export class NumberFieldRootContext {
	constructor(readonly opts: NumberFieldRootProps) {}

	valid = $derived.by(() => {
		const value = this.opts.value.current;
		const min = this.opts.min?.current;
		const max = this.opts.max?.current;

		const bn = safeBN(value);
		return bn.isFinite() && (min === undefined || bn.gte(min)) && (max === undefined || bn.lte(max));
	});
}

export class NumberFieldInputContext {
	constructor(readonly rootState: NumberFieldRootContext) {}

	oninput(e: Parameters<NonNullable<HTMLInputElement['oninput']>>[0]) {
		const value = (e.currentTarget as HTMLInputElement).value.replace(/[^\d.-]+/g, '').replace(/(?!^)-/g, '');
		const bn = safeBN(value);

		if (bn.isFinite()) this.rootState.opts.value.current = value;

		if (this.rootState.opts.min?.current !== undefined && bn.lt(this.rootState.opts.min.current)) {
			this.rootState.opts.value.current = String(this.rootState.opts.min.current);
		}
		if (this.rootState.opts.max?.current !== undefined && bn.gt(this.rootState.opts.max.current)) {
			this.rootState.opts.value.current = String(this.rootState.opts.max.current);
		}
	}

	props = $derived.by(() => ({
		type: 'text',
		oninput: this.oninput.bind(this),
		min: this.rootState.opts.min?.current,
		max: this.rootState.opts.max?.current,
		'aria-invalid': !this.rootState.valid,
		step: this.rootState.opts.step.current,
		id: this.rootState.opts.id?.current
	}));
}

type NumberFieldButtonProps = {
	direction: 'up' | 'down';
} & ReadableBoxedValues<{
	onpointerdown: ButtonElementProps['onpointerdown'];
	onpointerup: ButtonElementProps['onpointerup'];
	onpointerleave: ButtonElementProps['onpointerleave'];
	onpointercancel: ButtonElementProps['onpointercancel'];
	onclick: ButtonElementProps['onclick'];
	disabled: boolean;
}>;

export class NumberFieldButton {
	private keys = new PressedKeys();
	private shiftHeld = $derived(this.keys.has('shift'));
	rampState: ReturnType<typeof useRamp>;
	constructor(
		readonly rootState: NumberFieldRootContext,
		readonly opts: NumberFieldButtonProps
	) {
		this.increment = this.increment.bind(this);
		this.rampState = useRamp({
			increment: () => this.increment(this.shiftHeld),
			canRamp: () => this.enabled,
			...this.rootState.opts.rampSettings.current
		});
	}

	onpointerdown(e: Parameters<NonNullable<ButtonElementProps['onpointerdown']>>[0]) {
		this.increment(e.shiftKey);

		this.rampState.start();

		this.opts.onpointerdown.current?.(e);
	}

	onpointerup(e: Parameters<NonNullable<ButtonElementProps['onpointerup']>>[0]) {
		this.rampState.reset();
		this.opts.onpointerup.current?.(e);
	}

	onpointerleave(e: Parameters<NonNullable<ButtonElementProps['onpointerleave']>>[0]) {
		this.rampState.reset();
		this.opts.onpointerleave.current?.(e);
	}

	onpointercancel(e: Parameters<NonNullable<ButtonElementProps['onpointercancel']>>[0]) {
		this.rampState.reset();
		this.opts.onpointercancel.current?.(e);
	}

	onclick(e: Parameters<NonNullable<ButtonElementProps['onclick']>>[0]) {
		if (!this.rampState.ramping) return;

		this.increment(e.shiftKey);

		this.opts.onclick.current?.(e);
	}

	increment(shiftStep: boolean) {
		let step = this.opts.direction === 'up' ? this.rootState.opts.step.current : -this.rootState.opts.step.current;
		let absStep = Math.abs(this.rootState.opts.step.current);

		if (shiftStep && this.rootState.opts.shiftStep?.current) {
			step = this.opts.direction === 'up' ? this.rootState.opts.shiftStep.current : -this.rootState.opts.shiftStep.current;
			absStep = Math.abs(this.rootState.opts.shiftStep.current);
		}

		const decimals = absStep < 1 ? Math.max(0, Math.ceil(-Math.log10(absStep))) : 0;
		this.rootState.opts.value.current = safeBN(this.rootState.opts.value.current).plus(step).toFixed(decimals);
	}

	enabled = $derived.by(() => {
		if (!this.rootState.valid) return false;

		const step = this.opts.direction === 'up' ? this.rootState.opts.step.current : -this.rootState.opts.step.current;
		//* If shiftStep exists, use it. Default to step.
		const shiftStep = this.rootState.opts.shiftStep?.current
			? this.opts.direction === 'up'
				? this.rootState.opts.shiftStep?.current
				: -this.rootState.opts.shiftStep?.current
			: step;

		const newValue = safeBN(this.rootState.opts.value.current).plus(step);
		const shiftNewValue = safeBN(this.rootState.opts.value.current).plus(shiftStep);

		if (
			this.rootState.opts.min?.current !== undefined &&
			newValue.lt(this.rootState.opts.min.current) &&
			shiftNewValue.lt(this.rootState.opts.min.current)
		) {
			return false;
		}

		if (
			this.rootState.opts.max?.current !== undefined &&
			newValue.gt(this.rootState.opts.max.current) &&
			shiftNewValue.gt(this.rootState.opts.max.current)
		) {
			return false;
		}

		return true;
	});

	props = $derived.by(() => ({
		disabled: !this.enabled || this.opts.disabled.current,
		onpointerdown: this.onpointerdown.bind(this),
		onpointerup: this.onpointerup.bind(this),
		onpointerleave: this.onpointerleave.bind(this),
		onpointercancel: this.onpointercancel.bind(this),
		onclick: this.onclick.bind(this)
	}));

	destroy() {
		this.rampState.reset();
	}
}

const ctx = new Context<NumberFieldRootContext>('number-field-root');

export function useNumberField(props: NumberFieldRootProps) {
	return ctx.set(new NumberFieldRootContext(props));
}

export function useNumberFieldInput() {
	return new NumberFieldInputContext(ctx.get());
}

export function useNumberFieldButton(props: NumberFieldButtonProps) {
	return new NumberFieldButton(ctx.get(), props);
}
