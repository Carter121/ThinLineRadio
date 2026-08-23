<script lang="ts">
	//* Sites (P25 preferred-site duplicate detection). The list is small, so the whole
	//* array is saved through the system PATCH on every change.
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '$lib/components/ui/table';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import type { SystemsPageState } from './SystemsPageState.svelte.ts';
	import type { AdminSite, AdminSystemFull } from './systems-types.ts';

	interface Props {
		page: SystemsPageState;
		system: AdminSystemFull;
	}

	let { page, system }: Props = $props();

	const sites = $derived(system.sites ?? []);

	let dialogOpen = $state(false);
	let editIndex = $state<number | null>(null);
	let siteRef = $state('');
	let label = $state('');
	let rfss = $state('');
	let frequencies = $state('');
	let saving = $state(false);

	function openDialog(index: number | null) {
		editIndex = index;
		const site = index === null ? null : sites[index];
		siteRef = site?.siteRef ?? '';
		label = site?.label ?? '';
		rfss = site?.rfss ? String(site.rfss) : '';
		frequencies = (site?.frequencies ?? []).join(', ');
		dialogOpen = true;
	}

	async function persist(next: AdminSite[], message: string) {
		saving = true;
		try {
			const summary = await page.api.patchSystem(system.id, { sites: next.map((site, index) => ({ ...site, order: index + 1 })) });
			page.applySystemSummary(summary);
			toast.success(message);
			dialogOpen = false;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to save sites');
		} finally {
			saving = false;
		}
	}

	function save() {
		const ref = siteRef.trim();
		if (!ref) return toast.error('Site ID is required');
		if (!label.trim()) return toast.error('Label is required');
		if (sites.some((s, i) => i !== editIndex && s.siteRef === ref)) return toast.error(`Site ID ${ref} is already defined`);
		const freqs = frequencies
			.split(/[,\s]+/)
			.map((f) => Number(f))
			.filter((f) => Number.isFinite(f) && f > 0);
		const site: AdminSite = {
			...(editIndex === null ? {} : sites[editIndex]),
			siteRef: ref,
			label: label.trim(),
			rfss: Number(rfss) > 0 ? Math.floor(Number(rfss)) : 0,
			frequencies: freqs
		};
		const next = editIndex === null ? [...sites, site] : sites.map((s, i) => (i === editIndex ? site : s));
		void persist(next, editIndex === null ? `Added site ${site.label}` : `Saved ${site.label}`);
	}

	function remove(index: number) {
		const site = sites[index];
		void persist(
			sites.filter((_, i) => i !== index),
			`Removed site ${site.label}`
		);
	}
</script>

<div class="flex flex-col gap-3 pt-2">
	<div class="flex items-center gap-2">
		<p class="text-sm text-muted-foreground">Sites identify P25 tower sites for preferred-site duplicate detection. Site IDs keep leading zeros.</p>
		<Button size="sm" class="ml-auto" onclick={() => openDialog(null)}>
			<Plus data-icon="inline-start" />
			Add site
		</Button>
	</div>

	{#if sites.length === 0}
		<p class="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No sites defined.</p>
	{:else}
		<div class="overflow-x-auto rounded-md border border-border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead class="w-24">Site ID</TableHead>
						<TableHead class="w-20">RFSS</TableHead>
						<TableHead>Label</TableHead>
						<TableHead class="hidden md:table-cell">Frequencies (MHz)</TableHead>
						<TableHead class="w-20"></TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{#each sites as site, index (site.id ?? `${site.siteRef}-${index}`)}
						<TableRow>
							<TableCell class="font-mono text-xs">{site.siteRef}</TableCell>
							<TableCell class="text-sm">{site.rfss ?? 0}</TableCell>
							<TableCell class="font-medium">{site.label}</TableCell>
							<TableCell class="hidden text-sm text-muted-foreground md:table-cell">{(site.frequencies ?? []).join(', ') || '-'}</TableCell>
							<TableCell>
								<div class="flex justify-end gap-1">
									<Button variant="ghost" size="icon-sm" aria-label="Edit {site.label}" onclick={() => openDialog(index)}><Pencil /></Button>
									<Button variant="ghost" size="icon-sm" aria-label="Delete {site.label}" disabled={saving} onclick={() => remove(index)}><Trash2 /></Button>
								</div>
							</TableCell>
						</TableRow>
					{/each}
				</TableBody>
			</Table>
		</div>
	{/if}
</div>

<Dialog bind:open={dialogOpen}>
	<DialogContent class="sm:max-w-md">
		<DialogHeader>
			<DialogTitle>{editIndex === null ? 'Add site' : 'Edit site'}</DialogTitle>
			<DialogDescription>Optional receive frequencies help resolve the site from call metadata.</DialogDescription>
		</DialogHeader>
		<div class="grid gap-3">
			<div class="grid grid-cols-2 gap-3">
				<div class="grid gap-1.5">
					<Label for="site-ref">Site ID</Label>
					<Input id="site-ref" bind:value={siteRef} placeholder="001" />
				</div>
				<div class="grid gap-1.5">
					<Label for="site-rfss">RFSS</Label>
					<Input id="site-rfss" type="number" min="0" step="1" bind:value={rfss} placeholder="0" />
				</div>
			</div>
			<div class="grid gap-1.5">
				<Label for="site-label">Label</Label>
				<Input id="site-label" bind:value={label} />
			</div>
			<div class="grid gap-1.5">
				<Label for="site-freqs">Frequencies (MHz)</Label>
				<Input id="site-freqs" bind:value={frequencies} placeholder="154.12345, 155.67890" />
			</div>
		</div>
		<DialogFooter>
			<Button variant="outline" onclick={() => (dialogOpen = false)}>Cancel</Button>
			<Button onclick={save} disabled={saving}>{saving ? 'Saving' : editIndex === null ? 'Add site' : 'Save'}</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
