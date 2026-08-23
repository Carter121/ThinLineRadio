<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import Plus from '@lucide/svelte/icons/plus';
	import RadioTower from '@lucide/svelte/icons/radio-tower';
	import type { AdminSessionState } from '$lib/core/admin-session.svelte.ts';
	import { SystemsPageState } from './systems/SystemsPageState.svelte.ts';
	import SystemEditor from './systems/SystemEditor.svelte';
	import { SYSTEM_TYPES, systemTypeLabel } from './systems/systems-types.ts';

	interface Props {
		session: AdminSessionState;
	}

	let { session }: Props = $props();

	const page = new SystemsPageState(session);

	//* Keep a valid selection: default to the first system, drop a deleted one.
	$effect(() => {
		const systems = page.systems;
		if (systems.length === 0) {
			page.select(null);
			return;
		}
		if (page.selectedSystemId === null || !systems.some((s) => s.id === page.selectedSystemId)) {
			page.select(systems[0].id);
		}
	});

	let search = $state('');
	const filteredSystems = $derived.by(() => {
		const term = search.trim().toLowerCase();
		if (!term) return page.systems;
		return page.systems.filter((s) => s.label.toLowerCase().includes(term) || String(s.systemRef).includes(term));
	});

	//* New system dialog.
	let createOpen = $state(false);
	let createLabel = $state('');
	let createRef = $state('');
	let createType = $state('');
	let creating = $state(false);

	function nextSystemRef(): number {
		const refs = page.systems.map((s) => s.systemRef);
		return refs.length ? Math.max(...refs) + 1 : 1;
	}

	function openCreate() {
		createLabel = '';
		createRef = String(nextSystemRef());
		createType = '';
		createOpen = true;
	}

	async function submitCreate() {
		const ref = Number(createRef);
		if (!createLabel.trim()) return toast.error('Label is required');
		if (!Number.isInteger(ref) || ref < 1) return toast.error('System ID must be a positive integer');
		if (page.systems.some((s) => s.systemRef === ref)) return toast.error(`System ID ${ref} is already used`);
		creating = true;
		try {
			const systems = await page.api.createSystem({ label: createLabel.trim(), systemRef: ref, type: createType || undefined });
			await session.refreshConfig();
			const created = systems.find((s) => s.systemRef === ref);
			if (created) page.select(created.id);
			createOpen = false;
			toast.success(`Created system ${createLabel.trim()}`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to create system');
		} finally {
			creating = false;
		}
	}
</script>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-start justify-between gap-2">
		<div>
			<h2 class="text-lg font-semibold">Systems</h2>
			<p class="text-sm text-muted-foreground">Radio systems, their talkgroups, units, and sites. Edits save per row, so large systems stay fast.</p>
		</div>
		<Button size="sm" onclick={openCreate}>
			<Plus data-icon="inline-start" />
			Add system
		</Button>
	</div>

	{#if page.systems.length === 0}
		<div class="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-10 text-center">
			<RadioTower class="size-8 text-muted-foreground" />
			<p class="text-sm text-muted-foreground">No systems yet. Add one to start ingesting audio, or enable auto-populate on an API key.</p>
			<Button size="sm" onclick={openCreate}>
				<Plus data-icon="inline-start" />
				Add system
			</Button>
		</div>
	{:else}
		<div class="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
			<aside class="flex flex-col gap-2">
				{#if page.systems.length > 5}
					<Input placeholder="Search systems" bind:value={search} class="h-8" />
				{/if}
				<nav class="flex flex-row gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
					{#each filteredSystems as system (system.id)}
						{@const active = system.id === page.selectedSystemId}
						<button
							type="button"
							class="flex min-w-44 shrink-0 flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left text-sm transition-colors lg:min-w-0 {active
								? 'border-primary bg-primary/10'
								: 'border-border hover:bg-muted'}"
							onclick={() => page.select(system.id)}
						>
							<span class="flex w-full items-center gap-2">
								<span class="truncate font-medium">{system.label || 'Unnamed system'}</span>
								{#if !system.alertsEnabled}
									<Badge variant="outline" class="ml-auto shrink-0 text-[10px]">Alerts off</Badge>
								{/if}
							</span>
							<span class="text-xs text-muted-foreground">
								ID {system.systemRef}
								{#if system.type}
									· {systemTypeLabel(system.type)}
								{/if}
								· {system.talkgroups.length} talkgroups
							</span>
						</button>
					{/each}
				</nav>
			</aside>

			<div class="min-w-0">
				{#if page.selectedSystem}
					{#key page.selectedSystem.id}
						<SystemEditor {page} system={page.selectedSystem} />
					{/key}
				{/if}
			</div>
		</div>
	{/if}
</div>

<Dialog bind:open={createOpen}>
	<DialogContent class="sm:max-w-md">
		<DialogHeader>
			<DialogTitle>Add system</DialogTitle>
			<DialogDescription>Talkgroups, units, and sites can be added after the system exists.</DialogDescription>
		</DialogHeader>
		<div class="grid gap-3">
			<div class="grid gap-1.5">
				<Label for="new-system-label">Label</Label>
				<Input id="new-system-label" bind:value={createLabel} placeholder="System name" />
			</div>
			<div class="grid grid-cols-2 gap-3">
				<div class="grid gap-1.5">
					<Label for="new-system-ref">System ID</Label>
					<Input id="new-system-ref" type="number" min="1" step="1" bind:value={createRef} />
				</div>
				<div class="grid gap-1.5">
					<Label>Type</Label>
					<Select type="single" value={createType} onValueChange={(v) => (createType = v)}>
						<SelectTrigger class="w-full">{systemTypeLabel(createType)}</SelectTrigger>
						<SelectContent>
							{#each SYSTEM_TYPES as option (option.value)}
								<SelectItem value={option.value} label={option.label} />
							{/each}
						</SelectContent>
					</Select>
				</div>
			</div>
		</div>
		<DialogFooter>
			<Button variant="outline" onclick={() => (createOpen = false)}>Cancel</Button>
			<Button onclick={submitCreate} disabled={creating}>Create</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
