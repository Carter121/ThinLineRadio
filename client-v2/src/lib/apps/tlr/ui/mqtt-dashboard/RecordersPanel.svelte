<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { formatFrequency, formatDuration } from '$lib/apps/tlr/format.ts';
	import type { Recorder } from '$lib/apps/tlr/mqtt-types.ts';
	import Disc3 from '@lucide/svelte/icons/disc-3';

	let { recorders, breakdown }: { recorders: Recorder[]; breakdown: Record<string, number> } = $props();

	function tileClass(stateType: string): string {
		switch (stateType) {
			case 'RECORDING':
				return 'border-emerald-500/50 bg-emerald-500/10';
			case 'IDLE':
				return 'border-border/60 bg-muted/30';
			default:
				return 'border-border/30 bg-muted/10 opacity-50';
		}
	}

	function stateBadgeVariant(stateType: string): 'default' | 'secondary' | 'outline' | 'destructive' {
		switch (stateType) {
			case 'RECORDING':
				return 'default';
			case 'IDLE':
				return 'secondary';
			default:
				return 'outline';
		}
	}
</script>

<Card.Root class="gap-0 border-border/60 py-0">
	<Card.Header class="px-3.5 pt-3 pb-2">
		<Card.Title class="flex items-center gap-2 text-sm">
			<Disc3 class="size-3.5 text-muted-foreground" />
			Recorders
			<span class="ml-auto flex gap-1.5 text-xs font-normal text-muted-foreground">
				{#each Object.entries(breakdown) as [state, count] (state)}
					<span>{count} {state.toLowerCase()}</span>
				{/each}
			</span>
		</Card.Title>
	</Card.Header>
	<Card.Content class="px-3.5 pb-3">
		{#if recorders.length === 0}
			<p class="text-sm text-muted-foreground">No recorder data</p>
		{:else}
			<div class="grid grid-cols-2 gap-1.5 xl:grid-cols-3 2xl:grid-cols-4">
				{#each recorders as rec (rec.id)}
					<div class={['rounded border px-2 py-1.5 text-xs', tileClass(rec.rec_state_type)]}>
						<div class="flex items-center justify-between gap-1">
							<span class="font-mono font-medium">{rec.id}</span>
							<Badge variant={stateBadgeVariant(rec.rec_state_type)} class="px-1 py-0 text-[10px]">
								{rec.rec_state_type}
							</Badge>
						</div>
						<div class={['mt-0.5 text-muted-foreground', (rec.rec_state_type !== 'RECORDING' || !rec.freq) && 'invisible']}>
							{formatFrequency(rec.freq) ?? '—'}
						</div>
						<div class="mt-0.5 text-muted-foreground">
							#{rec.count} &middot; {formatDuration(rec.duration)}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</Card.Content>
</Card.Root>
