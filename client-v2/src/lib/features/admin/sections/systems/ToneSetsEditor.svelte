<script lang="ts">
	//* Editor for a talkgroup's tone sets (A/B/long tone specs, tolerance, per-set downstream).
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import type { AdminToneSet, AdminToneSpec } from './systems-types.ts';

	interface Props {
		value: AdminToneSet[];
		onchange: (toneSets: AdminToneSet[]) => void;
	}

	let { value, onchange }: Props = $props();

	type SpecKey = 'aTone' | 'bTone' | 'longTone';
	const SPECS: { key: SpecKey; label: string }[] = [
		{ key: 'aTone', label: 'A tone' },
		{ key: 'bTone', label: 'B tone' },
		{ key: 'longTone', label: 'Long tone' }
	];

	function update(index: number, patch: Partial<AdminToneSet>) {
		onchange(value.map((set, i) => (i === index ? { ...set, ...patch } : set)));
	}

	function updateSpec(index: number, key: SpecKey, field: keyof AdminToneSpec, raw: string) {
		const current = value[index][key] ?? { frequency: 0, minDuration: 0, maxDuration: 0 };
		const parsed = Number(raw);
		const spec = { ...current, [field]: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0 };
		//* An all-zero spec means "not used"; store null so the detector skips it.
		const empty = spec.frequency === 0 && spec.minDuration === 0 && spec.maxDuration === 0;
		update(index, { [key]: empty ? null : spec });
	}

	function add() {
		onchange([...value, { id: `ts-${Date.now()}`, label: '', aTone: null, bTone: null, longTone: null, tolerance: 0.02, downstreamEnabled: false }]);
	}

	function remove(index: number) {
		onchange(value.filter((_, i) => i !== index));
	}
</script>

<div class="flex flex-col gap-3">
	{#each value as set, index (set.id ?? index)}
		<div class="rounded-md border border-border p-3">
			<div class="flex items-center gap-2">
				<Input value={set.label} oninput={(e) => update(index, { label: (e.currentTarget as HTMLInputElement).value })} placeholder="Tone set label (e.g. Station 4)" class="h-8" />
				<Button variant="ghost" size="icon-sm" aria-label="Remove tone set" onclick={() => remove(index)}><Trash2 /></Button>
			</div>
			<div class="mt-2 grid gap-2 sm:grid-cols-3">
				{#each SPECS as spec (spec.key)}
					{@const s = set[spec.key]}
					<div class="rounded-sm bg-muted/40 p-2">
						<p class="mb-1 text-xs font-medium">{spec.label}</p>
						<div class="grid grid-cols-3 gap-1">
							<div class="grid gap-0.5">
								<Label class="text-[10px] text-muted-foreground">Hz</Label>
								<Input type="number" min="0" step="0.1" value={s?.frequency ?? ''} oninput={(e) => updateSpec(index, spec.key, 'frequency', (e.currentTarget as HTMLInputElement).value)} class="h-7 px-1.5 text-xs" />
							</div>
							<div class="grid gap-0.5">
								<Label class="text-[10px] text-muted-foreground">Min s</Label>
								<Input type="number" min="0" step="0.01" value={s?.minDuration ?? ''} oninput={(e) => updateSpec(index, spec.key, 'minDuration', (e.currentTarget as HTMLInputElement).value)} class="h-7 px-1.5 text-xs" />
							</div>
							<div class="grid gap-0.5">
								<Label class="text-[10px] text-muted-foreground">Max s</Label>
								<Input type="number" min="0" step="0.01" value={s?.maxDuration ?? ''} oninput={(e) => updateSpec(index, spec.key, 'maxDuration', (e.currentTarget as HTMLInputElement).value)} class="h-7 px-1.5 text-xs" />
							</div>
						</div>
					</div>
				{/each}
			</div>
			<div class="mt-2 grid gap-2 sm:grid-cols-2">
				<div class="grid gap-1">
					<Label class="text-xs">Tolerance</Label>
					<Input type="number" min="0" step="0.01" value={set.tolerance ?? ''} oninput={(e) => update(index, { tolerance: Number((e.currentTarget as HTMLInputElement).value) || 0 })} class="h-8" />
					<p class="text-[11px] text-muted-foreground">Ratio (0.02 = ±10 Hz, 0.03 = ±15 Hz) or an absolute value of 1 Hz or more.</p>
				</div>
				<div class="grid gap-1">
					<div class="flex items-center justify-between">
						<Label class="text-xs">Forward to TonesToActive</Label>
						<Switch checked={!!set.downstreamEnabled} onCheckedChange={(v) => update(index, { downstreamEnabled: v })} />
					</div>
					{#if set.downstreamEnabled}
						<Input value={set.downstreamURL ?? ''} oninput={(e) => update(index, { downstreamURL: (e.currentTarget as HTMLInputElement).value })} placeholder="https://host/api/tone-alert" class="h-8" />
						<Input value={set.downstreamAPIKey ?? ''} oninput={(e) => update(index, { downstreamAPIKey: (e.currentTarget as HTMLInputElement).value })} placeholder="API key" autocomplete="new-password" class="h-8" />
					{/if}
				</div>
			</div>
		</div>
	{:else}
		<p class="text-xs text-muted-foreground">No tone sets. Detection still runs (any tones trigger alerts); add sets to match specific stations.</p>
	{/each}
	<div>
		<Button variant="outline" size="sm" onclick={add}>
			<Plus data-icon="inline-start" />
			Add tone set
		</Button>
	</div>
</div>
