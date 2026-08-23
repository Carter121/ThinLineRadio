<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '$lib/components/ui/table';
	import BellRing from '@lucide/svelte/icons/bell-ring';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import MailPlus from '@lucide/svelte/icons/mail-plus';
	import Pencil from '@lucide/svelte/icons/pencil';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Search from '@lucide/svelte/icons/search';
	import Smartphone from '@lucide/svelte/icons/smartphone';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import Users from '@lucide/svelte/icons/users';
	import X from '@lucide/svelte/icons/x';
	import type { AdminSessionState } from '$lib/core/admin-session.svelte.ts';
	import {
		deleteDeviceToken,
		deleteUser,
		errorMessage,
		listGroups,
		listUsers,
		resendVerification,
		sendTestPush
	} from './access/access-api.ts';
	import { describeAccess, parseAccess, toPickerSystems, userDisplayName, type AdminUserGroupRecord, type AdminUserRecord } from './access/access-types.ts';
	import ConfirmDialog from './access/ConfirmDialog.svelte';
	import UserCreateDialog from './access/UserCreateDialog.svelte';
	import UserEditDialog from './access/UserEditDialog.svelte';
	import UserInviteDialog from './access/UserInviteDialog.svelte';
	import UserPasswordDialog from './access/UserPasswordDialog.svelte';
	import UserTransferDialog from './access/UserTransferDialog.svelte';

	interface Props {
		session: AdminSessionState;
	}

	let { session }: Props = $props();

	const PAGE_SIZE = 25;

	let users = $state.raw<AdminUserRecord[]>([]);
	let groups = $state.raw<AdminUserGroupRecord[]>([]);
	let loading = $state(true);
	let searchText = $state('');
	let page = $state(0);
	let expandedId = $state<number | null>(null);

	let createOpen = $state(false);
	let inviteOpen = $state(false);
	let editing = $state<AdminUserRecord | null>(null);
	let resetting = $state<AdminUserRecord | null>(null);
	let transferring = $state<AdminUserRecord | null>(null);
	let deleting = $state<AdminUserRecord | null>(null);
	let deleteBusy = $state(false);
	let tokenToDelete = $state<{ user: AdminUserRecord; tokenId: number } | null>(null);
	let tokenBusy = $state(false);

	const systems = $derived(toPickerSystems(session.config?.systems));
	const groupNames = $derived(new Map(groups.map((g) => [g.id, g.name])));

	const filtered = $derived.by(() => {
		const query = searchText.trim().toLowerCase();
		if (!query) return users;
		return users.filter((user) => {
			const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.toLowerCase();
			const group = (groupNames.get(user.userGroupId) ?? '').toLowerCase();
			return name.includes(query) || user.email.toLowerCase().includes(query) || group.includes(query) || (user.pin ?? '').toLowerCase() === query;
		});
	});
	const pageCount = $derived(Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
	const pageRows = $derived(filtered.slice(Math.min(page, pageCount - 1) * PAGE_SIZE, Math.min(page, pageCount - 1) * PAGE_SIZE + PAGE_SIZE));

	async function load(silent = false) {
		if (!silent) loading = true;
		try {
			const [userList, groupList] = await Promise.all([listUsers(session.client), listGroups(session.client)]);
			users = [...(userList ?? [])].sort((a, b) => a.email.localeCompare(b.email));
			groups = groupList;
		} catch (error) {
			toast.error(errorMessage(error, 'Failed to load users'));
		} finally {
			loading = false;
		}
	}

	function groupName(user: AdminUserRecord): string | null {
		if (!user.userGroupId) return null;
		return groupNames.get(user.userGroupId) ?? `Group ${user.userGroupId}`;
	}

	function tokenCount(user: AdminUserRecord): number {
		return user.fcmTokens?.length ?? 0;
	}

	async function confirmDelete() {
		if (!deleting) return;
		deleteBusy = true;
		try {
			await deleteUser(session.client, deleting.id);
			toast.success(`Deleted ${deleting.email}`);
			deleting = null;
			await load(true);
		} catch (error) {
			toast.error(errorMessage(error, 'Failed to delete user'));
		} finally {
			deleteBusy = false;
		}
	}

	async function confirmDeleteToken() {
		if (!tokenToDelete) return;
		tokenBusy = true;
		try {
			await deleteDeviceToken(session.client, tokenToDelete.user.id, tokenToDelete.tokenId);
			toast.success('Device token removed');
			tokenToDelete = null;
			await load(true);
		} catch (error) {
			toast.error(errorMessage(error, 'Failed to delete device token'));
		} finally {
			tokenBusy = false;
		}
	}

	async function testPush(user: AdminUserRecord) {
		try {
			await sendTestPush(session.client, user.id);
			toast.success(`Test push sent to ${user.email}`);
		} catch (error) {
			toast.error(errorMessage(error, 'Failed to send test push'));
		}
	}

	async function resend(user: AdminUserRecord) {
		try {
			await resendVerification(session.client, user.email);
			toast.success(`Verification email sent to ${user.email}`);
		} catch (error) {
			toast.error(errorMessage(error, 'Failed to resend verification email'));
		}
	}

	onMount(() => {
		void load();
	});
</script>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h2 class="text-lg font-semibold">Users</h2>
			<p class="text-sm text-muted-foreground">Accounts that can sign in to the web UI and mobile app. Changes save immediately.</p>
		</div>
		<div class="flex items-center gap-2">
			<Button variant="outline" size="sm" disabled={loading} onclick={() => void load()}>
				<RotateCcw data-icon="inline-start" />
				Refresh
			</Button>
			<Button variant="outline" size="sm" onclick={() => (inviteOpen = true)}>
				<MailPlus data-icon="inline-start" />
				Invite
			</Button>
			<Button size="sm" onclick={() => (createOpen = true)}>
				<UserPlus data-icon="inline-start" />
				Create user
			</Button>
		</div>
	</div>

	<div class="relative max-w-md">
		<Search class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
		<Input
			class="pl-9"
			placeholder="Search by name, email, group, or PIN"
			value={searchText}
			oninput={(e: Event) => {
				searchText = (e.currentTarget as HTMLInputElement).value;
				page = 0;
			}}
		/>
		{#if searchText}
			<button
				type="button"
				class="absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
				aria-label="Clear search"
				onclick={() => (searchText = '')}
			>
				<X class="size-4" />
			</button>
		{/if}
	</div>

	{#if loading}
		<div class="flex min-h-40 items-center justify-center">
			<Spinner class="size-6" />
		</div>
	{:else}
		<Card class="py-0">
			<CardContent class="px-0">
				{#if filtered.length === 0}
					<p class="px-5 py-8 text-center text-sm text-muted-foreground">
						{users.length === 0 ? 'No users registered yet.' : 'No users match your search.'}
					</p>
				{:else}
					<div class="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead class="w-8"></TableHead>
									<TableHead class="min-w-56">User</TableHead>
									<TableHead class="min-w-32">Group</TableHead>
									<TableHead class="min-w-40">Status</TableHead>
									<TableHead class="min-w-28">PIN</TableHead>
									<TableHead class="min-w-40">Last login</TableHead>
									<TableHead class="w-24 text-right">Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{#each pageRows as user (user.id)}
									{@const expanded = expandedId === user.id}
									<TableRow class="cursor-pointer" onclick={() => (expandedId = expanded ? null : user.id)}>
										<TableCell class="pr-0">
											<ChevronRight class={['size-4 text-muted-foreground transition-transform', expanded && 'rotate-90']} />
										</TableCell>
										<TableCell>
											<div class="font-medium">{userDisplayName(user)}</div>
											<div class="text-xs text-muted-foreground">{user.email}</div>
										</TableCell>
										<TableCell>
											{#if groupName(user)}
												<div class="flex flex-wrap items-center gap-1">
													<span class="text-sm">{groupName(user)}</span>
													{#if user.isGroupAdmin}
														<Badge variant="secondary">Admin</Badge>
													{/if}
												</div>
											{:else}
												<span class="text-sm text-muted-foreground">Unassigned</span>
											{/if}
										</TableCell>
										<TableCell>
											<div class="flex flex-wrap gap-1">
												{#if user.systemAdmin}
													<Badge>System admin</Badge>
												{/if}
												{#if user.verified}
													<Badge variant="outline">Verified</Badge>
												{:else}
													<Badge variant="destructive">Unverified</Badge>
												{/if}
												{#if user.forcePasswordReset}
													<Badge variant="outline">Password reset pending</Badge>
												{/if}
												{#if tokenCount(user) > 0}
													<Badge variant="secondary" class="gap-1"><Smartphone class="size-3" />{tokenCount(user)}</Badge>
												{/if}
											</div>
										</TableCell>
										<TableCell>
											<span class={['font-mono text-sm', user.pinExpired && 'text-destructive line-through']}>{user.pin}</span>
											{#if user.pinExpiresAt > 0 && !user.pinExpired}
												<div class="text-xs text-muted-foreground">Expires</div>
											{/if}
										</TableCell>
										<TableCell class="text-sm text-muted-foreground">{user.lastLogin}</TableCell>
										<TableCell class="text-right">
											<!-- svelte-ignore a11y_click_events_have_key_events -->
											<!-- svelte-ignore a11y_no_static_element_interactions -->
											<div class="flex items-center justify-end gap-1" onclick={(e: MouseEvent) => e.stopPropagation()}>
												<Button variant="ghost" size="icon-sm" aria-label="Edit user" onclick={() => (editing = user)}>
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
														<DropdownMenu.Item onclick={() => (transferring = user)}>
															<Users class="size-4" />
															Transfer to group
														</DropdownMenu.Item>
														<DropdownMenu.Item onclick={() => (resetting = user)}>
															<KeyRound class="size-4" />
															Reset password
														</DropdownMenu.Item>
														<DropdownMenu.Item onclick={() => void testPush(user)}>
															<BellRing class="size-4" />
															Send test push
														</DropdownMenu.Item>
														{#if !user.verified}
															<DropdownMenu.Item onclick={() => void resend(user)}>
																<MailPlus class="size-4" />
																Resend verification
															</DropdownMenu.Item>
														{/if}
														<DropdownMenu.Separator />
														<DropdownMenu.Item variant="destructive" onclick={() => (deleting = user)}>
															<Trash2 class="size-4" />
															Delete user
														</DropdownMenu.Item>
													</DropdownMenu.Content>
												</DropdownMenu.Root>
											</div>
										</TableCell>
									</TableRow>
									{#if expanded}
										<TableRow class="bg-muted/30 hover:bg-muted/30">
											<TableCell colspan={7} class="p-0">
												<div class="grid gap-4 px-6 py-4 md:grid-cols-2">
													<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
														<dt class="text-muted-foreground">Created</dt>
														<dd>{user.createdAt}</dd>
														<dt class="text-muted-foreground">ZIP code</dt>
														<dd>{user.zipCode || 'Not set'}</dd>
														<dt class="text-muted-foreground">Access</dt>
														<dd>{describeAccess(parseAccess(user.systems), systems)}</dd>
														<dt class="text-muted-foreground">Delay</dt>
														<dd>{user.delay > 0 ? `${user.delay} min` : 'Default'}</dd>
														<dt class="text-muted-foreground">Connection limit</dt>
														<dd>
															{user.effectiveConnectionLimit > 0 ? user.effectiveConnectionLimit : 'Unlimited'}
															{#if user.userGroupId && user.effectiveConnectionLimit !== user.connectionLimit}
																<span class="text-xs text-muted-foreground">(from group)</span>
															{/if}
														</dd>
														<dt class="text-muted-foreground">Push alerts</dt>
														<dd>
															{#if user.pushSystemNoAudioAlerts || user.pushApiKeyNoAudioAlerts}
																{[user.pushSystemNoAudioAlerts && 'System no-audio', user.pushApiKeyNoAudioAlerts && 'API key no-audio']
																	.filter(Boolean)
																	.join(', ')}
															{:else}
																None
															{/if}
														</dd>
													</dl>
													<div>
														<div class="mb-1 flex items-center gap-2 text-sm font-medium">
															<Smartphone class="size-4" />
															Device tokens
															<Badge variant="secondary">{tokenCount(user)}</Badge>
														</div>
														{#if tokenCount(user) === 0}
															<p class="text-xs text-muted-foreground">No mobile devices registered for push notifications.</p>
														{:else}
															<ul class="divide-y divide-border rounded-md border border-border bg-background">
																{#each user.fcmTokens ?? [] as token (token.id)}
																	<li class="flex items-center gap-3 px-3 py-2 text-xs">
																		<div class="min-w-0 flex-1">
																			<div class="flex flex-wrap items-center gap-1.5">
																				<Badge variant="outline">{token.platform || 'unknown'}</Badge>
																				<Badge variant="outline">{token.pushType || 'fcm'}</Badge>
																				{#if token.sound}
																					<span class="text-muted-foreground">sound: {token.sound}</span>
																				{/if}
																			</div>
																			<div class="mt-1 truncate font-mono text-muted-foreground">{token.fcmToken}</div>
																			<div class="text-muted-foreground">Registered {token.createdAt}, last used {token.lastUsed}</div>
																		</div>
																		<Button
																			variant="ghost"
																			size="icon-sm"
																			class="text-destructive"
																			aria-label="Delete device token"
																			onclick={() => (tokenToDelete = { user, tokenId: token.id })}
																		>
																			<Trash2 class="size-4" />
																		</Button>
																	</li>
																{/each}
															</ul>
														{/if}
													</div>
												</div>
											</TableCell>
										</TableRow>
									{/if}
								{/each}
							</TableBody>
						</Table>
					</div>
					{#if pageCount > 1}
						<div class="flex items-center justify-between border-t border-border px-4 py-2 text-sm text-muted-foreground">
							<span>{filtered.length} users</span>
							<div class="flex items-center gap-2">
								<Button variant="ghost" size="icon-sm" aria-label="Previous page" disabled={page === 0} onclick={() => (page = Math.max(0, page - 1))}>
									<ChevronLeft class="size-4" />
								</Button>
								<span>Page {Math.min(page, pageCount - 1) + 1} of {pageCount}</span>
								<Button
									variant="ghost"
									size="icon-sm"
									aria-label="Next page"
									disabled={page >= pageCount - 1}
									onclick={() => (page = Math.min(pageCount - 1, page + 1))}
								>
									<ChevronRight class="size-4" />
								</Button>
							</div>
						</div>
					{:else}
						<div class="border-t border-border px-4 py-2 text-xs text-muted-foreground">
							{filtered.length} user{filtered.length === 1 ? '' : 's'}
						</div>
					{/if}
				{/if}
			</CardContent>
		</Card>
	{/if}
</div>

{#if createOpen}
	<UserCreateDialog {session} {groups} onclose={() => (createOpen = false)} onsaved={() => void load(true)} />
{/if}
{#if inviteOpen}
	<UserInviteDialog {session} {groups} onclose={() => (inviteOpen = false)} />
{/if}
{#if editing}
	<UserEditDialog {session} user={editing} {groups} onclose={() => (editing = null)} onsaved={() => void load(true)} />
{/if}
{#if resetting}
	<UserPasswordDialog {session} user={resetting} onclose={() => (resetting = null)} onsaved={() => void load(true)} />
{/if}
{#if transferring}
	<UserTransferDialog {session} user={transferring} {groups} onclose={() => (transferring = null)} onsaved={() => void load(true)} />
{/if}

<ConfirmDialog
	bind:open={() => deleting !== null, (v) => (deleting = v ? deleting : null)}
	title="Delete this user?"
	description={deleting ? `${deleting.email} and their device tokens and alert preferences will be permanently removed.` : ''}
	confirmLabel="Delete user"
	destructive
	busy={deleteBusy}
	onconfirm={confirmDelete}
/>
<ConfirmDialog
	bind:open={() => tokenToDelete !== null, (v) => (tokenToDelete = v ? tokenToDelete : null)}
	title="Remove this device token?"
	description="The device stops receiving push notifications until the app registers again."
	confirmLabel="Remove"
	destructive
	busy={tokenBusy}
	onconfirm={confirmDeleteToken}
/>
