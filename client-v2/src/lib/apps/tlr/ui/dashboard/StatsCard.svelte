<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import Gauge from '@lucide/svelte/icons/gauge';
	import Flame from '@lucide/svelte/icons/flame';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index.ts';
	import { ChartContainer, ChartTooltip, type ChartConfig } from '$lib/components/ui/chart/index.ts';
	import { BarChart } from 'layerchart';
	import { scaleBand } from 'd3-scale';
	import type { StatsCardState } from './StatsCardState.svelte.ts';

	let { state: cardState }: { state: StatsCardState } = $props();

	const topTalkgroups = $derived(cardState.getTopTalkgroups(6));
	const callsPerMinute = $derived(cardState.getCallsPerMinute(10));

	const chartConfig = {
		count: {
			label: 'Calls',
			color: 'var(--color-primary)'
		}
	} satisfies ChartConfig;

	const chartXScale = scaleBand().padding(0.2);
	const chartSeries = [{ key: 'count', color: 'var(--color-primary)' }];
	const chartProps = {
		bars: { rounded: 'top' as const, strokeWidth: 0, class: 'opacity-60' },
		xAxis: { format: formatMinuteLabel },
		yAxis: { format: formatCountLabel }
	};

	function formatCountLabel(d: number): string {
		return Math.round(d).toString();
	}

	function formatMinuteTooltip(d: number | string): string {
		if (typeof d === 'number') {
			return new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
		}
		return String(d);
	}

	function formatMinuteLabel(d: number | string): string {
		if (typeof d === 'number') {
			return new Date(d).toLocaleTimeString('en-US', { minute: '2-digit', hour12: false }).toLowerCase();
		}
		return String(d);
	}

	let expandedCategories = new SvelteSet<string>();

	function toggleCategory(category: string) {
		if (expandedCategories.has(category)) expandedCategories.delete(category);
		else expandedCategories.add(category);
	}

	const categoryColors: Record<string, { border: string; bar: string }> = {
		Fire: { border: 'border-red-500', bar: 'bg-red-500' },
		Hazmat: { border: 'border-amber-500', bar: 'bg-amber-500' },
		'Medical / EMS': { border: 'border-emerald-500', bar: 'bg-emerald-500' },
		Medical: { border: 'border-emerald-500', bar: 'bg-emerald-500' },
		EMS: { border: 'border-emerald-500', bar: 'bg-emerald-500' },
		'Law Enforcement': { border: 'border-blue-500', bar: 'bg-blue-500' },
		Law: { border: 'border-blue-500', bar: 'bg-blue-500' },
		Traffic: { border: 'border-cyan-500', bar: 'bg-cyan-500' },
		Rescue: { border: 'border-orange-500', bar: 'bg-orange-500' }
	};

	const defaultColor = { border: 'border-primary', bar: 'bg-primary' };

	function getCategoryColor(category: string): { border: string; bar: string } {
		return categoryColors[category] ?? defaultColor;
	}
</script>

<Card class="gap-0 border-border/60 py-0">
	<CardHeader class="px-3.5 pt-3 pb-2">
		<CardTitle class="text-sm">Stats</CardTitle>
	</CardHeader>
	<CardContent class="space-y-4 px-3.5 pb-3.5">
		{#if callsPerMinute.length > 0}
			{#key callsPerMinute}
				<ChartContainer config={chartConfig} class="h-28 w-full min-w-1">
					<BarChart
						data={callsPerMinute}
						xScale={chartXScale}
						x="minute"
						y="count"
						series={chartSeries}
						axis={true}
						grid={false}
						rule={false}
						bandPadding={0.2}
						props={chartProps}
					>
						{#snippet tooltip()}
							<ChartTooltip labelFormatter={formatMinuteTooltip} />
						{/snippet}
					</BarChart>
				</ChartContainer>
			{/key}
		{/if}

		<div class="space-y-1.5">
			<div class="flex items-center gap-1.5 text-xs text-muted-foreground">
				<Gauge class="size-3.5" />Top talkgroups
			</div>
			{#if topTalkgroups.length === 0}
				<p class="text-sm text-muted-foreground">No data yet.</p>
			{:else}
				<div class="space-y-1">
					{#each topTalkgroups as item (item.label)}
						<div class="flex items-center justify-between gap-2 rounded-md border border-border/50 px-2.5 py-1.5">
							<div class="min-w-0">
								<p class="truncate text-sm text-foreground">{item.label}</p>
							</div>
							<span class="flex-none font-mono text-xs text-muted-foreground tabular-nums">{item.count}</span>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		{@const incidents = cardState.incidentSummary}
		{#if incidents.length > 0}
			{@const maxCount = Math.max(...incidents.map((c) => c.count), 1)}
			<div class="space-y-1.5">
				<div class="flex items-center gap-1.5 text-xs text-muted-foreground">
					<Flame class="size-3.5" />Today's Incident Summary
				</div>
				<div class="space-y-3">
					{#each incidents as cat (cat.category)}
						{@const color = getCategoryColor(cat.category)}
						{@const expanded = expandedCategories.has(cat.category)}
						<button
							type="button"
							class={[
								'flex w-full items-center gap-3 rounded-md border border-l-3 border-border/50 px-2.5 py-2.5 text-left transition-colors hover:bg-muted/50',
								color.border
							]}
							onclick={() => toggleCategory(cat.category)}
						>
							<span class="min-w-0 flex-1">
								<span class="block text-sm font-medium text-foreground">{cat.category}</span>
								<span class="mt-1.5 block h-2.5 w-full overflow-hidden rounded-full bg-muted">
									<span class="block h-full rounded-full transition-all {color.bar}" style="width: {(cat.count / maxCount) * 100}%"></span>
								</span>
							</span>
							<span class="flex items-center gap-1.5">
								<span class="font-mono text-xs text-muted-foreground tabular-nums">{cat.count}</span>
								{#if cat.subcategories?.length}
									{#if expanded}
										<ChevronUp class="size-3.5 text-muted-foreground" />
									{:else}
										<ChevronDown class="size-3.5 text-muted-foreground" />
									{/if}
								{/if}
							</span>
						</button>
						{#if expanded && cat.subcategories?.length}
							<div class="ml-4 space-y-0.5 pb-1">
								{#each cat.subcategories as sub (sub.label)}
									<div class="flex items-center gap-3 rounded-md px-2.5 py-1.5">
										<span class="min-w-0 flex-1">
											<span class="block text-xs text-muted-foreground">{sub.label}</span>
											<span class="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-muted">
												<span class="block h-full rounded-full transition-all {color.bar} opacity-70" style="width: {(sub.count / cat.count) * 100}%"
												></span>
											</span>
										</span>
										<span class="font-mono text-[11px] text-muted-foreground tabular-nums">{sub.count}</span>
									</div>
								{/each}
							</div>
						{/if}
					{/each}
				</div>
			</div>
		{/if}
	</CardContent>
</Card>
