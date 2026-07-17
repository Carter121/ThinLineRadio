<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.ts';
	import { formatAbsoluteTime } from '$lib/core/format.ts';
	import type { UnitEventEntry, UnitEventType } from '$lib/core/mqtt-types.ts';
	import Users from '@lucide/svelte/icons/users';

	let { unitEvents }: { unitEvents: UnitEventEntry[] } = $props();

	const badgeConfig: Record<UnitEventType, { label: string; class: string }> = {
		call: { label: 'CALL', class: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
		end: { label: 'END', class: 'bg-muted/60 text-muted-foreground border-border/60' },
		on: { label: 'ON', class: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
		off: { label: 'OFF', class: 'bg-muted/40 text-muted-foreground border-border/40' },
		join: { label: 'JOIN', class: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
		ackresp: { label: 'ACK', class: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
		data: { label: 'DATA', class: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
		ans_req: { label: 'ANS', class: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
		location: { label: 'LOC', class: 'bg-teal-500/20 text-teal-400 border-teal-500/30' }
	};
</script>

<Card.Root class="flex h-full flex-col gap-0 border-border/60 py-0">
	<Card.Header class="px-3.5 pt-3 pb-2">
		<Card.Title class="flex items-center gap-2 text-sm">
			<Users class="size-3.5 text-muted-foreground" />
			Unit Activity
		</Card.Title>
	</Card.Header>
	<Card.Content class="min-h-0 flex-1 p-0">
		{#if unitEvents.length === 0}
			<p class="px-3.5 pb-2 text-sm text-muted-foreground">No unit events yet</p>
		{:else}
			<div class="h-full overflow-y-auto">
				{#each unitEvents as event (event.timestamp + event.id)}
					{@const cfg = badgeConfig[event.eventType]}
					<div class="flex items-center gap-2 px-3.5 py-1 text-xs">
						<span class={['shrink-0 rounded border px-1 py-0.5 font-mono text-[10px]', cfg.class]}>
							{cfg.label}
						</span>
						<span class="min-w-0 flex-1 truncate">
							<span class="font-medium">{event.unit_alpha_tag || event.unit}</span>
							{#if event.talkgroup_alpha_tag}
								<span class="text-muted-foreground"> &rarr; {event.talkgroup_alpha_tag}</span>
							{/if}
						</span>
						<span class="shrink-0 font-mono text-muted-foreground">{formatAbsoluteTime(event.timestamp)}</span>
					</div>
				{/each}
			</div>
		{/if}
	</Card.Content>
</Card.Root>
