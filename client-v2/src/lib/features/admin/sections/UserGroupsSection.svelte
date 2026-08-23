<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '$lib/components/ui/table';
	import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import Ticket from '@lucide/svelte/icons/ticket';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import type { AdminSessionState } from '$lib/core/admin-session.svelte.ts';
	import { errorMessage, listGroups, listUsers } from './access/access-api.ts';
	import { describeAccess, parseAccess, toPickerSystems, type AdminUserGroupRecord, type AdminUserRecord } from './access/access-types.ts';
	import GroupAdminsDialog from './access/GroupAdminsDialog.svelte';
	import GroupCodesDialog from './access/GroupCodesDialog.svelte';
	import GroupDeleteDialog from './access/GroupDeleteDialog.svelte';
	import GroupEditDialog from './access/GroupEditDialog.svelte';

	interface Props {
		session: AdminSessionState;
	}

	let { session }: Props = $props();

	let groups = $state.raw<AdminUserGroupRecord[]>([]);
	let users = $state.raw<AdminUserRecord[]>([]);
	let loading = $state(true);

	let creating = $state(false);
	let editing = $state<AdminUserGroupRecord | null>(null);
	let codesFor = $state<AdminUserGroupRecord | null>(null);
	let adminsFor = $state<AdminUserGroupRecord | null>(null);
	let deleting = $state<AdminUserGroupRecord | null>(null);

	const systems = $derived(toPickerSystems(session.config?.systems));

	const memberCounts = $derived.by(() => {
		const counts = new Map<number, number>();
		for (const user of users) {
			if (user.userGroupId) counts.set(user.userGroupId, (counts.get(user.userGroupId) ?? 0) + 1);
		}
		return counts;
	});
	const adminCounts = $derived.by(() => {
		const counts = new Map<number, number>();
		for (const user of users) {
			if (user.userGroupId && user.isGroupAdmin) counts.set(user.userGroupId, (counts.get(user.userGroupId) ?? 0) + 1);
		}
		return counts;
	});

	async function load(silent = false) {
		if (!silent) loading = true;
		try {
			const [groupList, userList] = await Promise.all([listGroups(session.client), listUsers(session.client)]);
			groups = [...groupList].sort((a, b) => a.name.localeCompare(b.name));
			users = userList ?? [];
		} catch (error) {
			toast.error(errorMessage(error, 'Failed to load user groups'));
		} finally {
			loading = false;
		}
	}

	function members(group: AdminUserGroupRecord): AdminUserRecord[] {
		return users.filter((u) => u.userGroupId === group.id);
	}

	onMount(() => {
		void load();
	});
</script>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h2 class="text-lg font-semibold">User Groups</h2>
			<p class="text-sm text-muted-foreground">
				Groups bundle system access, delays and limits for their members, and own the registration codes and invitations that let people join. Changes
				save immediately.
			</p>
		</div>
		<div class="flex items-center gap-2">
			<Button variant="outline" size="sm" disabled={loading} onclick={() => void load()}>
				<RotateCcw data-icon="inline-start" />
				Refresh
			</Button>
			<Button size="sm" onclick={() => (creating = true)}>
				<Plus data-icon="inline-start" />
				Create group
			</Button>
		</div>
	</div>

	{#if loading}
		<div class="flex min-h-40 items-center justify-center">
			<Spinner class="size-6" />
		</div>
	{:else}
		<Card class="py-0">
			<CardContent class="px-0">
				{#if groups.length === 0}
					<p class="px-5 py-8 text-center text-sm text-muted-foreground">No user groups yet. Create one to organize users.</p>
				{:else}
					<div class="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead class="min-w-48">Group</TableHead>
									<TableHead class="min-w-44">Access</TableHead>
									<TableHead class="min-w-24">Members</TableHead>
									<TableHead class="min-w-36">Limits</TableHead>
									<TableHead class="min-w-36">Flags</TableHead>
									<TableHead class="w-24 text-right">Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{#each groups as group (group.id)}
									<TableRow>
										<TableCell>
											<div class="font-medium">{group.name}</div>
											{#if group.description}
												<div class="max-w-72 truncate text-xs text-muted-foreground">{group.description}</div>
											{/if}
										</TableCell>
										<TableCell class="text-sm">{describeAccess(parseAccess(group.systemAccess), systems)}</TableCell>
										<TableCell class="text-sm">
											{memberCounts.get(group.id) ?? 0}{group.maxUsers > 0 ? ` / ${group.maxUsers}` : ''}
											{#if adminCounts.get(group.id)}
												<div class="text-xs text-muted-foreground">{adminCounts.get(group.id)} admin{adminCounts.get(group.id) === 1 ? '' : 's'}</div>
											{/if}
										</TableCell>
										<TableCell class="text-sm">
											<div>Delay: {group.delay > 0 ? `${group.delay} min` : 'default'}</div>
											<div class="text-xs text-muted-foreground">
												Connections: {group.connectionLimit > 0 ? group.connectionLimit : 'unlimited'}
											</div>
										</TableCell>
										<TableCell>
											<div class="flex flex-wrap gap-1">
												{#if group.isPublicRegistration}
													<Badge>Public registration</Badge>
												{/if}
												{#if group.allowAddExistingUsers}
													<Badge variant="outline">Admins add existing users</Badge>
												{/if}
											</div>
										</TableCell>
										<TableCell class="text-right">
											<div class="flex items-center justify-end gap-1">
												<Button variant="ghost" size="icon-sm" aria-label="Edit group" onclick={() => (editing = group)}>
													<Pencil class="size-4" />
												</Button>
												<DropdownMenu.Root>
													<DropdownMenu.Trigger>
														{#snippet child({ props })}
															<Button {...props} variant="ghost" size="icon-sm" aria-label="More actions">
																<EllipsisVertical class="size-4" />
															</Button>
														{/snippet}
													</DropdownMenu.Trigger>
													<DropdownMenu.Content align="end">
														<DropdownMenu.Item onclick={() => (codesFor = group)}>
															<Ticket class="size-4" />
															Registration codes
														</DropdownMenu.Item>
														<DropdownMenu.Item onclick={() => (adminsFor = group)}>
															<ShieldCheck class="size-4" />
															Group admins
														</DropdownMenu.Item>
														<DropdownMenu.Separator />
														<DropdownMenu.Item variant="destructive" onclick={() => (deleting = group)}>
															<Trash2 class="size-4" />
															Delete group
														</DropdownMenu.Item>
													</DropdownMenu.Content>
												</DropdownMenu.Root>
											</div>
										</TableCell>
									</TableRow>
								{/each}
							</TableBody>
						</Table>
					</div>
				{/if}
			</CardContent>
		</Card>
	{/if}
</div>

{#if creating}
	<GroupEditDialog {session} group={null} {users} onclose={() => (creating = false)} onsaved={() => void load(true)} />
{/if}
{#if editing}
	<GroupEditDialog {session} group={editing} {users} onclose={() => (editing = null)} onsaved={() => void load(true)} />
{/if}
{#if codesFor}
	<GroupCodesDialog {session} group={codesFor} onclose={() => (codesFor = null)} />
{/if}
{#if adminsFor}
	<GroupAdminsDialog {session} group={adminsFor} {users} onclose={() => (adminsFor = null)} onchanged={() => void load(true)} />
{/if}
{#if deleting}
	<GroupDeleteDialog
		{session}
		group={deleting}
		members={members(deleting)}
		otherGroups={groups.filter((g) => g.id !== deleting?.id)}
		onclose={() => (deleting = null)}
		ondeleted={() => void load(true)}
	/>
{/if}
