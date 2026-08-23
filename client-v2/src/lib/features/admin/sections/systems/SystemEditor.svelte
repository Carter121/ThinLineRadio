<script lang="ts">
	import { toast } from 'svelte-sonner';
	import {
		AlertDialog,
		AlertDialogAction,
		AlertDialogCancel,
		AlertDialogContent,
		AlertDialogDescription,
		AlertDialogFooter,
		AlertDialogHeader,
		AlertDialogTitle
	} from '$lib/components/ui/alert-dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import type { SystemsPageState } from './SystemsPageState.svelte.ts';
	import type { AdminSystemFull } from './systems-types.ts';
	import { systemTypeLabel } from './systems-types.ts';
	import SystemSettingsForm from './SystemSettingsForm.svelte';
	import TalkgroupsTable from './TalkgroupsTable.svelte';
	import UnitsTable from './UnitsTable.svelte';
	import SitesTable from './SitesTable.svelte';

	interface Props {
		page: SystemsPageState;
		system: AdminSystemFull;
	}

	let { page, system }: Props = $props();

	let tab = $state('talkgroups');
	let deleteOpen = $state(false);
	let deleting = $state(false);

	async function confirmDelete() {
		deleting = true;
		try {
			await page.api.deleteSystem(system.id);
			await page.session.refreshConfig();
			toast.success(`Deleted system ${system.label}`);
			deleteOpen = false;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to delete system');
		} finally {
			deleting = false;
		}
	}
</script>

<div class="flex flex-col gap-3">
	<div class="flex flex-wrap items-center gap-2">
		<div class="min-w-0 flex-1">
			<h3 class="truncate text-base font-semibold">{system.label || 'Unnamed system'}</h3>
			<p class="text-xs text-muted-foreground">
				System ID {system.systemRef}
				{#if system.type}
					<Badge variant="secondary" class="ml-1 align-middle text-[10px]">{systemTypeLabel(system.type)}</Badge>
				{/if}
				{#if !system.alertsEnabled}
					<Badge variant="outline" class="ml-1 align-middle text-[10px]">Alerts disabled</Badge>
				{/if}
			</p>
		</div>
		<Button variant="outline" size="sm" onclick={() => (deleteOpen = true)}>
			<Trash2 data-icon="inline-start" />
			Delete system
		</Button>
	</div>

	<Tabs bind:value={tab}>
		<TabsList class="max-w-full overflow-x-auto">
			<TabsTrigger value="talkgroups">Talkgroups <span class="text-muted-foreground">({system.talkgroups.length})</span></TabsTrigger>
			<TabsTrigger value="units">Units <span class="text-muted-foreground">({system.units.length})</span></TabsTrigger>
			<TabsTrigger value="sites">Sites <span class="text-muted-foreground">({system.sites?.length ?? 0})</span></TabsTrigger>
			<TabsTrigger value="settings">Settings</TabsTrigger>
		</TabsList>
		<!--* Inactive tab panels stay mounted, so only build the active table's rows. -->
		<TabsContent value="talkgroups">
			{#if tab === 'talkgroups'}<TalkgroupsTable {page} {system} />{/if}
		</TabsContent>
		<TabsContent value="units">
			{#if tab === 'units'}<UnitsTable {page} {system} />{/if}
		</TabsContent>
		<TabsContent value="sites">
			{#if tab === 'sites'}<SitesTable {page} {system} />{/if}
		</TabsContent>
		<TabsContent value="settings">
			{#if tab === 'settings'}<SystemSettingsForm {page} {system} />{/if}
		</TabsContent>
	</Tabs>
</div>

<AlertDialog bind:open={deleteOpen}>
	<AlertDialogContent>
		<AlertDialogHeader>
			<AlertDialogTitle>Delete {system.label}?</AlertDialogTitle>
			<AlertDialogDescription>
				This removes the system with its {system.talkgroups.length} talkgroups and {system.units.length} units, and permanently deletes every call recorded
				on them. This cannot be undone.
			</AlertDialogDescription>
		</AlertDialogHeader>
		<AlertDialogFooter>
			<AlertDialogCancel>Cancel</AlertDialogCancel>
			<AlertDialogAction onclick={confirmDelete} disabled={deleting}>Delete system</AlertDialogAction>
		</AlertDialogFooter>
	</AlertDialogContent>
</AlertDialog>
