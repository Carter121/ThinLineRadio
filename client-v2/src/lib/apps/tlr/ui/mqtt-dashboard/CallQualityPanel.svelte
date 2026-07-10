<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.ts';
	import { formatDuration } from '$lib/apps/tlr/format.ts';
	import type { SystemCallQuality } from '$lib/apps/tlr/mqtt-types.ts';
	import ChartBar from '@lucide/svelte/icons/chart-bar';

	let { callQuality }: { callQuality: Map<string, SystemCallQuality> } = $props();

	const systems = $derived([...callQuality.values()].sort((a, b) => a.sys_name.localeCompare(b.sys_name)));

	function errorRatePct(q: SystemCallQuality): number {
		return q.callCount > 0 ? (q.callsWithErrors / q.callCount) * 100 : 0;
	}

	function errorRateClass(pct: number): string {
		if (pct >= 50) return 'text-destructive';
		if (pct >= 20) return 'text-amber-400';
		return 'text-emerald-400';
	}

	function fmt(n: number, decimals = 1): string {
		return n.toFixed(decimals);
	}
</script>

<Card.Root class="gap-0 border-border/60 py-0">
	<Card.Header class="px-3.5 pt-3 pb-2">
		<Card.Title class="flex items-center gap-2 text-sm">
			<ChartBar class="size-3.5 text-muted-foreground" />
			Call Quality
			<span class="ml-auto text-xs font-normal text-muted-foreground">since page load</span>
		</Card.Title>
	</Card.Header>
	<Card.Content class="px-3.5 pb-3">
		{#if systems.length === 0}
			<p class="text-sm text-muted-foreground">Waiting for call data…</p>
		{:else}
			<div class="space-y-3">
				{#each systems as q (q.sys_num)}
					<div class="space-y-1.5">
						<div class="flex items-center gap-2 text-xs">
							<span class="font-medium">{q.sys_name}</span>
							<span class="text-muted-foreground">{q.callCount} calls</span>
						</div>
						<div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
							<!-- Avg length -->
							<div class="flex justify-between">
								<span class="text-muted-foreground">Avg length</span>
								<span class="font-mono">{formatDuration(q.avgLength)}</span>
							</div>
							<!-- Freq error -->
							<div class="flex justify-between">
								<span class="text-muted-foreground">Freq error</span>
								<span class="font-mono">{fmt(q.avgFreqError)} Hz</span>
							</div>
							<!-- Error rate -->
							<div class="flex justify-between">
								<span class="text-muted-foreground">Error rate</span>
								<span class={['font-mono', errorRateClass(errorRatePct(q))]}>
									{fmt(errorRatePct(q))}%
									<span class="text-muted-foreground">({fmt(q.avgErrors, 1)}/call)</span>
								</span>
							</div>
							<!-- Spike rate -->
							<div class="flex justify-between">
								<span class="text-muted-foreground">Spike rate</span>
								<span class={['font-mono', errorRateClass((q.callsWithSpikes / q.callCount) * 100)]}>
									{fmt((q.callsWithSpikes / q.callCount) * 100)}%
									<span class="text-muted-foreground">({fmt(q.avgSpikes, 1)}/call)</span>
								</span>
							</div>
							<!-- Signal -->
							{#if q.avgSignal !== null}
								<div class="flex justify-between">
									<span class="text-muted-foreground">Avg signal</span>
									<span class="font-mono">{fmt(q.avgSignal)} dBm</span>
								</div>
							{/if}
							<!-- Noise -->
							{#if q.avgNoise !== null}
								<div class="flex justify-between">
									<span class="text-muted-foreground">Avg noise</span>
									<span class="font-mono">{fmt(q.avgNoise)} dBm</span>
								</div>
							{/if}
						</div>
					</div>
					<!-- Divider between systems -->
					{#if q.sys_name !== systems[systems.length - 1].sys_name}
						<div class="border-t border-border/40"></div>
					{/if}
				{/each}
			</div>
		{/if}
	</Card.Content>
</Card.Root>
