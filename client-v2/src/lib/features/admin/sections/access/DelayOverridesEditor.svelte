<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import type { PickerSystem } from './access-types.ts';

	export interface SystemDelayRow {
		systemRef: number;
		delay: number;
	}

	export interface TalkgroupDelayRow {
		systemRef: number;
		talkgroupRef: number;
		delay: number;
	}

	interface Props {
		systems: PickerSystem[];
		systemRows: SystemDelayRow[];
		talkgroupRows: TalkgroupDelayRow[];
	}

	let { systems, systemRows = $bindable(), talkgroupRows = $bindable() }: Props = $props();

	function systemLabel(systemRef: number): string {
		if (!systemRef) return 'Select system';
		return systems.find((s) => s.systemRef === systemRef)?.label ?? `System ${systemRef}`;
	}

	function talkgroupsFor(systemRef: number) {
		return systems.find((s) => s.systemRef === systemRef)?.talkgroups ?? [];
	}

	function talkgroupLabel(systemRef: number, talkgroupRef: number): string {
		if (!talkgroupRef) return 'Select talkgroup';
		return talkgroupsFor(systemRef).find((tg) => tg.talkgroupRef === talkgroupRef)?.label ?? `Talkgroup ${talkgroupRef}`;
	}

	function numberFrom(event: Event): number {
		const parsed = Number((event.currentTarget as HTMLInputElement).value);
		return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
	}
</script>

<div class="grid gap-4 lg:grid-cols-2">
	<div class="flex flex-col gap-2">
		<div class="flex items-center justify-between">
			<Label class="text-sm font-medium">System delays (minutes)</Label>
			<Button variant="outline" size="sm" onclick={() => systemRows.push({ systemRef: 0, delay: 0 })}>
				<Plus data-icon="inline-start" />
				Add
			</Button>
		</div>
		{#if systemRows.length === 0}
			<p class="text-xs text-muted-foreground">No per-system delays. The base delay applies everywhere.</p>
		{/if}
		{#each systemRows as row, index (index)}
			<div class="flex items-center gap-2">
				<Select type="single" value={row.systemRef ? String(row.systemRef) : ''} onValueChange={(v) => (row.systemRef = Number(v))}>
					<SelectTrigger size="sm" class="min-w-0 flex-1">{systemLabel(row.systemRef)}</SelectTrigger>
					<SelectContent>
						{#each systems as system (system.systemRef)}
							<SelectItem value={String(system.systemRef)} label={system.label} />
						{/each}
					</SelectContent>
				</Select>
				<Input type="number" min={0} class="h-8 w-24" value={String(row.delay)} onchange={(e: Event) => (row.delay = numberFrom(e))} />
				<Button variant="ghost" size="icon-sm" class="text-destructive" aria-label="Remove delay" onclick={() => systemRows.splice(index, 1)}>
					<Trash2 class="size-4" />
				</Button>
			</div>
		{/each}
	</div>

	<div class="flex flex-col gap-2">
		<div class="flex items-center justify-between">
			<Label class="text-sm font-medium">Talkgroup delays (minutes)</Label>
			<Button variant="outline" size="sm" onclick={() => talkgroupRows.push({ systemRef: 0, talkgroupRef: 0, delay: 0 })}>
				<Plus data-icon="inline-start" />
				Add
			</Button>
		</div>
		{#if talkgroupRows.length === 0}
			<p class="text-xs text-muted-foreground">No per-talkgroup delays.</p>
		{/if}
		{#each talkgroupRows as row, index (index)}
			<div class="flex flex-wrap items-center gap-2">
				<Select
					type="single"
					value={row.systemRef ? String(row.systemRef) : ''}
					onValueChange={(v) => {
						row.systemRef = Number(v);
						row.talkgroupRef = 0;
					}}
				>
					<SelectTrigger size="sm" class="min-w-32 flex-1">{systemLabel(row.systemRef)}</SelectTrigger>
					<SelectContent>
						{#each systems as system (system.systemRef)}
							<SelectItem value={String(system.systemRef)} label={system.label} />
						{/each}
					</SelectContent>
				</Select>
				<Select
					type="single"
					value={row.talkgroupRef ? String(row.talkgroupRef) : ''}
					onValueChange={(v) => (row.talkgroupRef = Number(v))}
					disabled={!row.systemRef}
				>
					<SelectTrigger size="sm" class="min-w-40 flex-1">{talkgroupLabel(row.systemRef, row.talkgroupRef)}</SelectTrigger>
					<SelectContent class="max-h-72">
						{#each talkgroupsFor(row.systemRef) as tg (tg.talkgroupRef)}
							<SelectItem value={String(tg.talkgroupRef)} label={tg.label} />
						{/each}
					</SelectContent>
				</Select>
				<Input type="number" min={0} class="h-8 w-24" value={String(row.delay)} onchange={(e: Event) => (row.delay = numberFrom(e))} />
				<Button variant="ghost" size="icon-sm" class="text-destructive" aria-label="Remove delay" onclick={() => talkgroupRows.splice(index, 1)}>
					<Trash2 class="size-4" />
				</Button>
			</div>
		{/each}
	</div>
</div>
