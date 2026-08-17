<script lang="ts">
	import { AGE_BANDS } from './age-bands.ts';
	import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '$lib/components/ui/collapsible/index.ts';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';

	//* Default open on desktop, closed on phones where map space is precious.
	let open = $state(typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches);
</script>

<div class="absolute bottom-3 left-3 z-[1000]">
	<Collapsible bind:open>
		<div class="rounded-md border border-border bg-popover/90 text-popover-foreground shadow-sm backdrop-blur">
			<CollapsibleTrigger
				class="flex w-full cursor-pointer items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
			>
				<span class="size-2 rounded-full" style:background-color={AGE_BANDS[0].color}></span>
				Incident age
				<ChevronUp class={['size-3 transition-transform', !open && 'rotate-180']} />
			</CollapsibleTrigger>
			<CollapsibleContent>
				<ul class="space-y-1 px-2.5 pt-0.5 pb-2">
					{#each AGE_BANDS as band (band.maxMin)}
						<li class="flex items-center gap-2 text-xs text-muted-foreground">
							<span class="size-2.5 shrink-0 rounded-full" style:background-color={band.color} style:opacity={band.opacity}></span>
							{band.label}
						</li>
					{/each}
					<li class="flex items-center gap-2 text-xs text-muted-foreground">
						<span class="size-2.5 shrink-0 rounded-full border border-dashed" style:border-color={AGE_BANDS[0].color}></span>
						Approximate location
					</li>
				</ul>
				<p class="border-t border-border px-2.5 py-1 text-[10px] text-muted-foreground/70">Tiles: CARTO, OpenStreetMap</p>
			</CollapsibleContent>
		</div>
	</Collapsible>
</div>
