<script lang="ts">
	import Truck from '@lucide/svelte/icons/truck';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index.ts';
	import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '$lib/components/ui/collapsible/index.ts';
	import { Separator } from '$lib/components/ui/separator';
	import { PersistedState } from 'runed';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { departments, specialtyClass, staffingLabel } from './apparatus-data.ts';

	// Persisted open/close state per department and station
	const deptOpen = new PersistedState<Record<string, boolean>>('tlr-apparatus-deptOpen', Object.fromEntries(departments.map((d) => [d.name, false])));
	const stationOpen = new PersistedState<Record<string, boolean>>(
		'tlr-apparatus-stationOpen',
		Object.fromEntries(departments.flatMap((d) => d.stations.map((s) => [s.id, true])))
	);

	function isDeptOpen(name: string) {
		return deptOpen.current[name] ?? false;
	}
	function isStationOpen(id: string) {
		return stationOpen.current[id] ?? false;
	}

	const allOpen = $derived(
		departments.every((d) => deptOpen.current[d.name]) && departments.every((d) => d.stations.every((s) => stationOpen.current[s.id] ?? true))
	);

	function toggleAll() {
		const next = !allOpen;
		for (const d of departments) {
			deptOpen.current[d.name] = next;
			for (const s of d.stations) stationOpen.current[s.id] = next;
		}
	}

	const totalStations = departments.reduce((sum, d) => sum + d.stations.length, 0);
	const totalApparatus = departments.reduce((sum, d) => d.stations.reduce((s2, st) => s2 + st.apparatus.length, sum), 0);

	let { standalone = false }: { standalone?: boolean } = $props();
</script>

<Card class="flex flex-col gap-0 border-border/60 py-0">
	<CardHeader class="flex-none px-3.5 pt-3 pb-2">
		<div class="flex items-center justify-between gap-2">
			<div class="flex items-center gap-1.5">
				<Truck class="size-3.5 text-muted-foreground" />
				<CardTitle class="text-sm">Apparatus — Salt Lake County</CardTitle>
			</div>
			<Button variant="ghost" size="sm" class="h-6 px-2 text-xs text-muted-foreground" onclick={toggleAll}>
				{allOpen ? 'Collapse all' : 'Expand all'}
			</Button>
		</div>
		<div class="flex gap-3 pt-0.5">
			<span class="text-[11px] text-muted-foreground"><span class="font-medium text-foreground/70">{departments.length}</span> agencies</span>
			<span class="text-[11px] text-muted-foreground"><span class="font-medium text-foreground/70">{totalStations}</span> stations</span>
			<span class="text-[11px] text-muted-foreground"><span class="font-medium text-foreground/70">{totalApparatus}</span> apparatus</span>
		</div>
	</CardHeader>
	<CardContent class="flex-1 overflow-hidden p-0">
		<div class={['overflow-y-auto px-3.5 pb-3', !standalone && 'max-h-128']}>
			{#each departments as dept, di (dept.name)}
				{#if di > 0}
					<Separator class="my-2" />
				{/if}
				<Collapsible open={isDeptOpen(dept.name)} onOpenChange={(open) => (deptOpen.current[dept.name] = open)}>
					{@const deptApparatus = dept.stations.reduce((sum, s) => sum + s.apparatus.length, 0)}
					{@const deptAllStationsOpen = dept.stations.every((s) => stationOpen.current[s.id] ?? true)}
					<CollapsibleTrigger class="flex w-full cursor-pointer items-center justify-between rounded px-1 py-1.5 hover:bg-muted/50">
						<span class="text-sm font-semibold text-foreground">{dept.name}</span>
						<div class="flex items-center gap-2">
							<span class="text-xs text-muted-foreground">{dept.stations.length} stations · {deptApparatus} apparatus</span>
							<ChevronDown class={['size-4 text-muted-foreground transition-transform duration-200', isDeptOpen(dept.name) && 'rotate-180']} />
						</div>
					</CollapsibleTrigger>
					<CollapsibleContent>
						<div class="mt-1 space-y-0.5">
							<div class="flex justify-end pb-0.5">
								<button
									class="rounded border border-border/50 bg-muted/40 px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
									onclick={() => {
										const next = !deptAllStationsOpen;
										for (const s of dept.stations) stationOpen.current[s.id] = next;
									}}>{deptAllStationsOpen ? 'Collapse stations' : 'Expand stations'}</button
								>
							</div>
							{#each dept.stations as station (station.id)}
								<Collapsible open={isStationOpen(station.id)} onOpenChange={(open) => (stationOpen.current[station.id] = open)}>
									{@const bcUnit = station.apparatus.find((a) => a.name.toLowerCase().includes('battalion chief'))}
									{@const bcLabel = bcUnit ? 'B' + (bcUnit.name.match(/\d+/)?.[0] ?? '') : null}
									<CollapsibleTrigger class="flex w-full cursor-pointer items-start justify-between gap-2 rounded px-1 py-1.5 hover:bg-muted/40">
										<div class="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
											<div class="flex flex-wrap items-center gap-1">
												<span class="text-xs font-medium text-foreground">{station.number}</span>
												{#if bcLabel}
													<span
														class="inline-flex items-center rounded border border-orange-800/50 bg-orange-950/60 px-1 py-px text-[10px] leading-tight text-orange-400"
														>{bcLabel}</span
													>
												{/if}
												{#each station.specialties as spec (spec)}
													<span class={['inline-flex items-center rounded border px-1 py-px text-[10px] leading-tight', specialtyClass(spec)]}
														>{spec}</span
													>
												{/each}
											</div>
											{#if station.address}
												<span class="flex items-center gap-0.5 text-[11px] text-muted-foreground/70">
													<MapPin class="size-2.5 shrink-0" />
													{station.address}
												</span>
											{/if}
										</div>
										<div class="mt-0.5 flex shrink-0 items-center gap-1">
											<span class="text-[11px] text-muted-foreground/60">{station.apparatus.length}</span>
											<ChevronDown
												class={['size-3.5 text-muted-foreground transition-transform duration-200', isStationOpen(station.id) && 'rotate-180']}
											/>
										</div>
									</CollapsibleTrigger>
									<CollapsibleContent>
										<div class="mb-1.5 ml-2 border-l border-border/40 pl-2">
											{#each station.apparatus as unit, i (unit.name)}
												{@const [staffNum, staffNote] = unit.staffing.includes('(')
													? [unit.staffing.slice(0, unit.staffing.indexOf('(')).trim(), unit.staffing.slice(unit.staffing.indexOf('(') + 1, -1)]
													: [unit.staffing, null]}
												{@const isBC = unit.name.toLowerCase().includes('battalion chief')}
												<div
													class={['flex items-center gap-2 px-1 py-1', isBC ? 'rounded bg-orange-950/30' : i % 2 === 0 ? 'rounded bg-muted/25' : '']}
												>
													<span
														class={[
															'w-8 shrink-0 rounded px-1 py-0.5 text-center text-[10px] leading-tight font-medium tabular-nums',
															isBC
																? 'bg-orange-950/60 text-orange-400'
																: staffNum === 'X'
																	? 'bg-muted/40 text-muted-foreground/50'
																	: staffNote?.toLowerCase().includes('seasonal')
																		? 'bg-amber-950/50 text-amber-400'
																		: 'bg-muted/60 text-foreground/80'
														]}>{staffingLabel(staffNum)}</span
													>
													<span class={['text-xs', isBC ? 'font-medium text-orange-300/90' : 'text-foreground/85']}>{unit.name}</span>
													{#if staffNote}
														<span class="ml-auto shrink-0 text-[10px] text-muted-foreground/50">{staffNote}</span>
													{/if}
												</div>
											{/each}
										</div>
									</CollapsibleContent>
								</Collapsible>
							{/each}
						</div>
					</CollapsibleContent>
				</Collapsible>
			{/each}
		</div>
	</CardContent>
</Card>
