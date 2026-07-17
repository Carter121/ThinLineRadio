<script lang="ts">
	import Info from '@lucide/svelte/icons/info';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index.ts';
	import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '$lib/components/ui/collapsible/index.ts';
	import { Separator } from '$lib/components/ui/separator';
	import { UnitInfoCardState } from './UnitInfoCardState.svelte.ts';

	interface CountySection {
		label: string;
		entries: readonly (readonly [string, string])[];
	}

	interface County {
		name: string;
		sections: CountySection[];
	}

	const counties: County[] = [
		{
			name: 'Salt Lake County',
			sections: [
				{
					label: 'By Agency',
					entries: [
						['00s', 'Salt Lake City'],
						['10s', 'Unified Fire Authority'],
						['20s', 'Draper'],
						['30s', 'Sandy'],
						['40s', 'South Salt Lake'],
						['50s', 'West Jordan'],
						['60s', 'South Jordan'],
						['70s', 'West Valley City'],
						['80s', 'Murray'],
						['90s', 'Bluffdale']
					]
				},
				{
					label: 'UFA Stations',
					entries: [
						['101', 'Millcreek'],
						['102', 'Magna'],
						['103', 'Herriman'],
						['104', 'Holladay'],
						['106', 'Millcreek (East)'],
						['107', 'West Jordan (Oquirrh Shadows)'],
						['108', 'Brighton'],
						['109', 'Kearns'],
						['110', 'Cottonwood Hts'],
						['111', 'Magna'],
						['112', 'Millcreek (Olympus Cove)'],
						['113', 'Snowbird'],
						['115', 'Copperton'],
						['116', 'Cottonwood Hts (Wasatch)'],
						['117', 'Taylorsville'],
						['118', 'Taylorsville'],
						['119', 'Emigration Canyon'],
						['120', 'Riverton'],
						['121', 'Riverton'],
						['123', 'Herriman (Rosecrest)'],
						['124', 'Riverton (East)'],
						['125', 'Midvale'],
						['126', 'Midvale'],
						['251', 'Eagle Mountain'],
						['252', 'Eagle Mountain'],
						['253', 'Eagle Mountain']
					]
				}
			]
		}
	];

	//* Intentionally leaving this unused data so I can possibly use it in the future
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const unusedCounties: County[] = [
		{
			name: 'Davis County',
			sections: [
				{
					label: 'By Agency',
					entries: [
						['00s', 'South Weber'],
						['20s', 'Clinton'],
						['30s', 'Syracuse'],
						['40s', 'North Davis'],
						['50s', 'Layton'],
						['60s', 'Kaysville'],
						['70s', 'Farmington'],
						['80s', 'South Davis Metro']
					]
				}
			]
		},
		{
			name: 'Utah County',
			sections: [
				{
					label: 'By Agency',
					entries: [
						['20s', 'Provo'],
						['30s', 'Orem'],
						['40s', 'Springville'],
						['50s', 'American Fork'],
						['60s', 'Spanish Fork'],
						['70s', 'Pleasant Grove'],
						['80s', 'Lehi'],
						['90s', 'Payson'],
						['100s', 'Mapleton'],
						['140s', 'Santaquin'],
						['160s', 'Goshen'],
						['170s', 'Genola'],
						['190s', 'Woodland Hills'],
						['200s', 'Lone Peak'],
						['210s', 'North Fork'],
						['220s', 'Elk Ridge'],
						['230s', 'Cedar Fort'],
						['250s', 'Unified Fire Authority']
					]
				}
			]
		}
	];

	let { state: externalState }: { state?: UnitInfoCardState } = $props();
	const ownState = $derived(externalState ? null : new UnitInfoCardState({ counties: counties.map((county) => county.name) }));
	const cardState = $derived(externalState ?? ownState!);
</script>

<Card class="flex flex-col gap-0 border-border/60 py-0">
	<CardHeader class="flex-none px-3.5 pt-3 pb-2">
		<div class="flex items-center gap-1.5">
			<Info class="size-3.5 text-muted-foreground" />
			<CardTitle class="text-sm">Unit Reference</CardTitle>
		</div>
	</CardHeader>
	<CardContent class="flex-1 overflow-hidden p-0">
		<div class="max-h-128 overflow-y-auto px-3.5 pb-3">
			{#each counties as county, ci (county.name)}
				{#if ci > 0}
					<Separator class="my-2" />
				{/if}
				<Collapsible open={cardState.countyOpen.current[county.name]} onOpenChange={(open) => (cardState.countyOpen.current[county.name] = open)}>
					<CollapsibleTrigger class="flex w-full cursor-pointer items-center justify-between rounded px-1 py-1.5 hover:bg-muted/50">
						<span class="text-sm font-semibold text-foreground">{county.name}</span>
						<ChevronDown
							class={['size-4 text-muted-foreground transition-transform duration-200', cardState.countyOpen.current[county.name] && 'rotate-180']}
						/>
					</CollapsibleTrigger>
					<CollapsibleContent>
						{#if county.sections.length === 0}
							<p class="px-1 py-1 text-sm text-muted-foreground italic">No data yet</p>
						{:else}
							<div class="mt-1 space-y-1">
								{#each county.sections as section, si (section.label)}
									{#if county.sections.length > 1}
										{@const open = cardState.isSectionOpen(county.name, section.label)}
										<Collapsible {open} onOpenChange={(v) => cardState.setSectionOpen(county.name, section.label, v)}>
											<CollapsibleTrigger class="flex w-full cursor-pointer items-center justify-between rounded px-1 py-1 hover:bg-muted/50">
												<span class="text-xs font-medium tracking-wide text-muted-foreground uppercase">{section.label}</span>
												<ChevronDown class={['size-3.5 text-muted-foreground transition-transform duration-200', open && 'rotate-180']} />
											</CollapsibleTrigger>
											<CollapsibleContent>
												<div class="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-1">
													{#each section.entries as [code, label] (code)}
														<span class="text-sm text-muted-foreground tabular-nums">{code}</span>
														<span class="text-sm text-foreground">{label}</span>
													{/each}
												</div>
											</CollapsibleContent>
										</Collapsible>
										{#if si < county.sections.length - 1}
											<Separator class="my-1" />
										{/if}
									{:else}
										<div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-1">
											{#each section.entries as [code, label] (code)}
												<span class="text-sm text-muted-foreground tabular-nums">{code}</span>
												<span class="text-sm text-foreground">{label}</span>
											{/each}
										</div>
									{/if}
								{/each}
							</div>
						{/if}
					</CollapsibleContent>
				</Collapsible>
			{/each}
		</div>
	</CardContent>
</Card>
