<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import type { SystemsPageState } from './SystemsPageState.svelte.ts';
	import type { AdminSystemFull, AdminUnit } from './systems-types.ts';

	interface Props {
		page: SystemsPageState;
		system: AdminSystemFull;
		unit: AdminUnit | null;
		open: boolean;
	}

	let { page, system, unit, open = $bindable() }: Props = $props();

	let unitRef = $state(unit?.unitRef ? String(unit.unitRef) : '');
	let unitFrom = $state(unit?.unitFrom ? String(unit.unitFrom) : '');
	let unitTo = $state(unit?.unitTo ? String(unit.unitTo) : '');
	let label = $state(unit?.label ?? '');
	let saving = $state(false);

	const isNew = $derived(unit === null);

	function parse(value: string): number {
		const n = Number(value);
		return Number.isInteger(n) && n > 0 ? n : 0;
	}

	async function save() {
		const ref = parse(unitRef);
		const from = parse(unitFrom);
		const to = parse(unitTo);
		if (!label.trim()) return toast.error('Label is required');
		if (!ref && !(from && to)) return toast.error('Enter a unit ID or a from/to range');
		if (from && to && to < from) return toast.error('Range end must not be below range start');
		if (ref && system.units.some((u) => u.id !== unit?.id && u.unitRef === ref)) return toast.error(`Unit ID ${ref} is already used in this system`);

		saving = true;
		try {
			const body = { unitRef: ref, unitFrom: from, unitTo: to, label: label.trim() };
			const saved = isNew ? await page.api.createUnit(system.id, body) : await page.api.patchUnit(system.id, unit!.id, body);
			page.applyUnit(system.id, saved);
			toast.success(isNew ? `Added unit ${saved.label}` : `Saved ${saved.label}`);
			open = false;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to save unit');
		} finally {
			saving = false;
		}
	}
</script>

<Dialog bind:open>
	<DialogContent class="sm:max-w-md">
		<DialogHeader>
			<DialogTitle>{isNew ? 'Add unit' : `Edit ${unit?.label}`}</DialogTitle>
			<DialogDescription>Map a radio unit ID (decimal) or a range of IDs to a friendly label.</DialogDescription>
		</DialogHeader>
		<div class="grid gap-3">
			<div class="grid gap-1.5">
				<Label for="unit-label">Label</Label>
				<Input id="unit-label" bind:value={label} placeholder="e.g. Engine 4" />
			</div>
			<div class="grid gap-1.5">
				<Label for="unit-ref">Unit ID</Label>
				<Input id="unit-ref" type="number" min="1" step="1" bind:value={unitRef} />
			</div>
			<div class="grid grid-cols-2 gap-3">
				<div class="grid gap-1.5">
					<Label for="unit-from">Range from</Label>
					<Input id="unit-from" type="number" min="1" step="1" bind:value={unitFrom} />
				</div>
				<div class="grid gap-1.5">
					<Label for="unit-to">Range to</Label>
					<Input id="unit-to" type="number" min="1" step="1" bind:value={unitTo} />
				</div>
			</div>
			<p class="text-xs text-muted-foreground">A range labels every ID from start to end; the unit ID alone labels one radio.</p>
		</div>
		<DialogFooter>
			<Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
			<Button onclick={save} disabled={saving}>{saving ? 'Saving' : isNew ? 'Add unit' : 'Save'}</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
