<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { formatFrequency } from '$lib/core/format.ts';
	import type { SystemInfo, SystemRate } from '$lib/core/mqtt-types.ts';
	import Antenna from '@lucide/svelte/icons/antenna';

	let { systems, rates }: { systems: SystemInfo[]; rates: SystemRate[] } = $props();

	const rateMap = $derived(
		rates.reduce<Record<string, SystemRate>>((acc, r) => {
			acc[r.sys_name] = r;
			return acc;
		}, {})
	);

	function systemTypeLabel(type: string): string {
		switch (type) {
			case 'p25':
				return 'P25';
			case 'conventionalP25':
				return 'P25 Con';
			case 'conventional':
				return 'Conventional';
			default:
				return type;
		}
	}
</script>

<Card.Root class="gap-0 border-border/60 py-0">
	<Card.Header class="px-3.5 pt-3 pb-2">
		<Card.Title class="flex items-center gap-2 text-sm">
			<Antenna class="size-3.5 text-muted-foreground" />
			Systems
		</Card.Title>
	</Card.Header>
	<Card.Content class="px-3.5 pb-3">
		{#if systems.length === 0}
			<p class="text-sm text-muted-foreground">Waiting for system data…</p>
		{:else}
			<div class="space-y-2">
				{#each systems as sys (sys.sys_num)}
					{@const rate = rateMap[sys.sys_name]}
					<div class="rounded border border-border/60 bg-muted/20 px-2.5 py-2 text-xs">
						<div class="flex items-center gap-2">
							<span class="font-medium">{sys.sys_name}</span>
							<Badge variant="outline" class="px-1 py-0 text-[10px]">{systemTypeLabel(sys.type)}</Badge>
							{#if sys.nac && sys.nac !== '0'}
								<span class="ml-auto font-mono text-muted-foreground">NAC {sys.nac}</span>
							{/if}
						</div>
						{#if sys.type === 'p25' || sys.type === 'conventionalP25'}
							<div class="mt-1 flex gap-3 text-muted-foreground">
								{#if sys.sysid && sys.sysid !== '0'}
									<span>SYSID {sys.sysid}</span>
								{/if}
								{#if sys.wacn && sys.wacn !== '0'}
									<span>WACN {sys.wacn}</span>
								{/if}
								{#if sys.rfss}
									<span>RFSS {sys.rfss} Site {sys.site_id}</span>
								{/if}
							</div>
						{/if}
						{#if rate}
							<div class="mt-1.5 flex items-center gap-2">
								<div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
									<div class="h-full rounded-full bg-emerald-500 transition-all" style="width: {Math.min(100, (rate.decoderate / 60) * 100)}%"></div>
								</div>
								<span class="shrink-0 text-muted-foreground">{rate.decoderate.toFixed(1)} msg/s</span>
							</div>
							{#if rate.control_channel}
								<div class="mt-0.5 text-muted-foreground">CC {formatFrequency(rate.control_channel)}</div>
							{/if}
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</Card.Content>
</Card.Root>
