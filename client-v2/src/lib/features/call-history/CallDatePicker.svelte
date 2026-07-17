<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Calendar } from '$lib/components/ui/calendar/index.ts';
	import * as Popover from '$lib/components/ui/popover/index.ts';
	import { cn } from '$lib/utils/shadcn.ts';
	import { getLocalTimeZone, type DateValue } from '@internationalized/date';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';

	let {
		value = $bindable<DateValue | undefined>(),
		class: className,
		onSelect
	}: {
		value?: DateValue;
		class?: string;
		onSelect?: () => void;
	} = $props();

	let open = $state(false);

	const formatter = new Intl.DateTimeFormat(undefined, {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});

	const label = $derived(value ? formatter.format(value.toDate(getLocalTimeZone())) : 'Select date');
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="outline" size="sm" class={cn('w-38 justify-between gap-2 font-normal', className)}>
				<span class="flex min-w-0 items-center gap-1.5">
					<CalendarIcon class="size-3.5 shrink-0" />
					<span class="truncate">{label}</span>
				</span>
				<ChevronDownIcon class="size-3.5 shrink-0 opacity-60" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-auto overflow-hidden p-0" align="start">
		<Calendar
			type="single"
			bind:value
			captionLayout="dropdown"
			onValueChange={() => {
				open = false;
				onSelect?.();
			}}
		/>
	</Popover.Content>
</Popover.Root>
