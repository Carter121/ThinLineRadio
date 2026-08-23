<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Spinner } from '$lib/components/ui/spinner';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import UserMinus from '@lucide/svelte/icons/user-minus';
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import type { AdminSessionState } from '$lib/core/admin-session.svelte.ts';
	import { assignGroupAdmin, errorMessage, listGroupAdmins, removeGroupAdmin } from './access-api.ts';
	import { userDisplayName, type AdminUserGroupRecord, type AdminUserRecord, type GroupAdminSummary } from './access-types.ts';

	interface Props {
		session: AdminSessionState;
		group: AdminUserGroupRecord;
		users: AdminUserRecord[];
		onclose: () => void;
		onchanged: () => void;
	}

	let { session, group, users, onclose, onchanged }: Props = $props();

	let open = $state(true);
	let loading = $state(true);
	let busyId = $state<number | null>(null);
	let admins = $state.raw<GroupAdminSummary[]>([]);
	let search = $state('');
	let selectedUserId = $state(0);

	const adminIds = $derived(new Set(admins.map((a) => a.id)));
	//* Any user can be picked; the server moves them into this group if needed.
	const candidates = $derived.by(() => {
		const query = search.trim().toLowerCase();
		const list = users.filter((u) => !adminIds.has(u.id));
		const filtered = query ? list.filter((u) => u.email.toLowerCase().includes(query) || userDisplayName(u).toLowerCase().includes(query)) : list;
		return filtered.slice(0, 50);
	});

	function onOpenChange(next: boolean) {
		open = next;
		if (!next) onclose();
	}

	async function load() {
		loading = true;
		try {
			admins = await listGroupAdmins(session.client, group.id);
		} catch (error) {
			toast.error(errorMessage(error, 'Failed to load group admins'));
		} finally {
			loading = false;
		}
	}

	async function assign() {
		if (!selectedUserId) {
			toast.error('Select a user first');
			return;
		}
		busyId = selectedUserId;
		try {
			await assignGroupAdmin(session.client, selectedUserId, group.id);
			toast.success('Group admin assigned');
			selectedUserId = 0;
			search = '';
			onchanged();
			await load();
		} catch (error) {
			toast.error(errorMessage(error, 'Failed to assign group admin'));
		} finally {
			busyId = null;
		}
	}

	async function remove(admin: GroupAdminSummary) {
		busyId = admin.id;
		try {
			await removeGroupAdmin(session.client, admin.id, group.id);
			toast.success('Group admin removed');
			onchanged();
			await load();
		} catch (error) {
			toast.error(errorMessage(error, 'Failed to remove group admin'));
		} finally {
			busyId = null;
		}
	}

	onMount(() => {
		void load();
	});
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="flex max-h-[85vh] w-[95vw] flex-col sm:max-w-xl">
		<Dialog.Header>
			<Dialog.Title>Group admins</Dialog.Title>
			<Dialog.Description>Admins of {group.name} can manage its members, codes and invitations.</Dialog.Description>
		</Dialog.Header>

		<div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
			<div class="flex flex-col gap-2">
				<Label>Current admins</Label>
				{#if loading}
					<div class="flex min-h-16 items-center justify-center">
						<Spinner class="size-5" />
					</div>
				{:else if admins.length === 0}
					<p class="text-sm text-muted-foreground">This group has no admins yet.</p>
				{:else}
					<ul class="divide-y divide-border rounded-md border border-border">
						{#each admins as admin (admin.id)}
							<li class="flex items-center gap-3 px-3 py-2 text-sm">
								<div class="min-w-0 flex-1">
									<div class="truncate font-medium">{userDisplayName(admin)}</div>
									<div class="truncate text-xs text-muted-foreground">{admin.email}</div>
								</div>
								<Button variant="outline" size="sm" disabled={busyId === admin.id} onclick={() => void remove(admin)}>
									{#if busyId === admin.id}
										<Loader2 data-icon="inline-start" class="animate-spin" />
									{:else}
										<UserMinus data-icon="inline-start" />
									{/if}
									Remove
								</Button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			<div class="flex flex-col gap-2">
				<Label for="admin-search">Assign a user as admin</Label>
				<Input id="admin-search" placeholder="Search users by name or email" bind:value={search} autocomplete="off" />
				<div class="max-h-56 overflow-y-auto rounded-md border border-border">
					{#if candidates.length === 0}
						<p class="px-3 py-2 text-sm text-muted-foreground">No matching users.</p>
					{:else}
						<ul class="divide-y divide-border">
							{#each candidates as user (user.id)}
								<li>
									<button
										type="button"
										class={[
											'flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted/50',
											selectedUserId === user.id && 'bg-muted'
										]}
										onclick={() => (selectedUserId = user.id)}
									>
										<span class="min-w-0 flex-1 truncate">{userDisplayName(user)}</span>
										<span class="truncate text-xs text-muted-foreground">{user.email}</span>
										{#if user.userGroupId && user.userGroupId !== group.id}
											<span class="shrink-0 text-xs text-muted-foreground">(other group)</span>
										{/if}
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
				<p class="text-xs text-muted-foreground">Users from other groups are moved into this group when assigned.</p>
			</div>
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => onOpenChange(false)}>Close</Button>
			<Button disabled={!selectedUserId || busyId !== null} onclick={assign}>
				{#if busyId !== null && busyId === selectedUserId}
					<Loader2 data-icon="inline-start" class="animate-spin" />
				{:else}
					<UserPlus data-icon="inline-start" />
				{/if}
				Assign admin
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
