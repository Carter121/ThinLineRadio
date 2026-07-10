<script lang="ts">
	import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
	import AudioLines from '@lucide/svelte/icons/audio-lines';
	import ShieldAlert from '@lucide/svelte/icons/shield-alert';
	import Waves from '@lucide/svelte/icons/waves';
	import { Card, CardContent, CardHeader, CardDescription } from '$lib/components/ui/card/index.ts';
	import type { SummaryCardsState } from './SummaryCardsState.svelte.ts';

	let { state: cardState }: { state: SummaryCardsState } = $props();
</script>

<div class="grid gap-2.5 {cardState.showSystemAlerts ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3'}">
	<Card class="gap-0 border-border/60 py-0">
		<CardHeader class="px-3.5 pt-3 pb-0">
			<CardDescription class="flex items-center gap-1.5 text-xs"><AlertTriangle class="size-3.5" />Alerts (1h)</CardDescription>
		</CardHeader>
		<CardContent class="flex items-end justify-between px-3.5 pt-0 pb-3">
			<span class="text-2xl font-semibold tracking-tight text-foreground">{cardState.recentAlertCount}</span>
		</CardContent>
	</Card>

	<Card class="gap-0 border-border/60 py-0">
		<CardHeader class="px-3.5 pt-3 pb-0">
			<CardDescription class="flex items-center gap-1.5 text-xs"><AudioLines class="size-3.5" />Calls (1m)</CardDescription>
		</CardHeader>
		<CardContent class="flex items-end justify-between px-3.5 pt-0 pb-3">
			<span class="text-2xl font-semibold tracking-tight text-foreground">{cardState.callsLastMinute}</span>
		</CardContent>
	</Card>

	<Card class="gap-0 border-border/60 py-0">
		<CardHeader class="px-3.5 pt-3 pb-0">
			<CardDescription class="flex items-center gap-1.5 text-xs"><Waves class="size-3.5" />Calls (1h)</CardDescription>
		</CardHeader>
		<CardContent class="flex items-end justify-between px-3.5 pt-0 pb-3">
			<span class="text-2xl font-semibold tracking-tight text-foreground">{cardState.callsLastHour}</span>
		</CardContent>
	</Card>

	{#if cardState.showSystemAlerts}
		<Card class="gap-0 border-border/60 py-0">
			<CardHeader class="px-3.5 pt-3 pb-0">
				<CardDescription class="flex items-center gap-1.5 text-xs"><ShieldAlert class="size-3.5" />System Alerts</CardDescription>
			</CardHeader>
			<CardContent class="flex items-end justify-between px-3.5 pt-0 pb-3">
				<span class="text-2xl font-semibold tracking-tight text-foreground">{cardState.activeSystemAlertCount}</span>
			</CardContent>
		</Card>
	{/if}
</div>
