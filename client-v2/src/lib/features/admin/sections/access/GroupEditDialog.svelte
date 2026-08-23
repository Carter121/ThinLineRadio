<script lang="ts">
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import { Separator } from '$lib/components/ui/separator';
	import { Textarea } from '$lib/components/ui/textarea';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import type { AdminSessionState } from '$lib/core/admin-session.svelte.ts';
	import { createGroup, errorMessage, updateGroup } from './access-api.ts';
	import {
		describeAccess,
		parseAccess,
		parseDelayMap,
		serializeDelayMap,
		serializeGroupAccess,
		toPickerSystems,
		userDisplayName,
		type AccessSystems,
		type AdminUserGroupRecord,
		type AdminUserRecord,
		type GroupCreatePayload,
		type GroupEditableFields
	} from './access-types.ts';
	import DelayOverridesEditor, { type SystemDelayRow, type TalkgroupDelayRow } from './DelayOverridesEditor.svelte';
	import SystemAccessDialog from './SystemAccessDialog.svelte';

	interface Props {
		session: AdminSessionState;
		//* null creates a new group.
		group: AdminUserGroupRecord | null;
		users: AdminUserRecord[];
		onclose: () => void;
		onsaved: () => void;
	}

	let { session, group, users, onclose, onsaved }: Props = $props();

	type AdminMode = 'none' | 'existing' | 'new';

	//* Seeded once; the parent mounts a fresh dialog per group.
	const initial = untrack(() => (group ? $state.snapshot(group) : null));

	let open = $state(true);
	let saving = $state(false);
	let accessOpen = $state(false);

	let name = $state(initial?.name ?? '');
	let description = $state(initial?.description ?? '');
	let delay = $state(initial?.delay ?? 0);
	let connectionLimit = $state(initial?.connectionLimit ?? 0);
	let maxUsers = $state(initial?.maxUsers ?? 0);
	let isPublicRegistration = $state(!!initial?.isPublicRegistration);
	let allowAddExistingUsers = $state(!!initial?.allowAddExistingUsers);
	let access = $state<AccessSystems>(parseAccess(initial?.systemAccess ?? ''));
	let systemRows = $state<SystemDelayRow[]>(
		Object.entries(parseDelayMap(initial?.systemDelays)).map(([key, value]) => ({ systemRef: Number(key), delay: value }))
	);
	let talkgroupRows = $state<TalkgroupDelayRow[]>(
		Object.entries(parseDelayMap(initial?.talkgroupDelays)).map(([key, value]) => {
			const [systemRef, talkgroupRef] = key.split(':').map(Number);
			return { systemRef: systemRef || 0, talkgroupRef: talkgroupRef || 0, delay: value };
		})
	);

	//* Create-only: optionally seed the group with an admin.
	let adminMode = $state<AdminMode>('none');
	let adminUserId = $state(0);
	let adminSearch = $state('');
	let newAdminEmail = $state('');
	let newAdminPassword = $state('');
	let newAdminFirstName = $state('');
	let newAdminLastName = $state('');
	let newAdminZipCode = $state('');

	const systems = $derived(toPickerSystems(session.config?.systems));
	const candidateAdmins = $derived.by(() => {
		const query = adminSearch.trim().toLowerCase();
		const list = query ? users.filter((u) => u.email.toLowerCase().includes(query) || userDisplayName(u).toLowerCase().includes(query)) : users;
		return list.slice(0, 50);
	});
	const selectedAdmin = $derived(users.find((u) => u.id === adminUserId) ?? null);

	function onOpenChange(next: boolean) {
		open = next;
		if (!next) onclose();
	}

	function nonNegative(value: unknown): number {
		const parsed = Number(value);
		return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
	}

	function fields(): GroupEditableFields {
		const systemDelays: Record<string, number> = {};
		for (const row of systemRows) if (row.systemRef && row.delay > 0) systemDelays[String(row.systemRef)] = row.delay;
		const talkgroupDelays: Record<string, number> = {};
		for (const row of talkgroupRows) {
			if (row.systemRef && row.talkgroupRef && row.delay > 0) talkgroupDelays[`${row.systemRef}:${row.talkgroupRef}`] = row.delay;
		}
		return {
			name: name.trim(),
			description: description.trim(),
			systemAccess: serializeGroupAccess(access),
			delay: nonNegative(delay),
			systemDelays: serializeDelayMap(systemDelays),
			talkgroupDelays: serializeDelayMap(talkgroupDelays),
			connectionLimit: nonNegative(connectionLimit),
			maxUsers: nonNegative(maxUsers),
			isPublicRegistration,
			allowAddExistingUsers
		};
	}

	async function save() {
		if (!name.trim()) {
			toast.error('Group name is required');
			return;
		}
		const base = fields();
		saving = true;
		try {
			if (group) {
				await updateGroup(session.client, group, base);
				toast.success('Group updated');
			} else {
				const payload: GroupCreatePayload = { ...base };
				if (adminMode === 'existing') {
					if (!adminUserId) {
						toast.error('Select a user to make group admin');
						return;
					}
					payload.assignExistingUserAsAdmin = true;
					payload.groupAdminUserId = adminUserId;
				} else if (adminMode === 'new') {
					const zip = newAdminZipCode.trim();
					if (!newAdminEmail.trim() || !newAdminPassword || !newAdminFirstName.trim() || !newAdminLastName.trim() || !zip) {
						toast.error('All group admin fields are required');
						return;
					}
					if (newAdminPassword.length < 6) {
						toast.error('Admin password must be at least 6 characters');
						return;
					}
					if (!/^\d{5}(-\d{4})?$/.test(zip)) {
						toast.error('Admin ZIP code must be 12345 or 12345-6789');
						return;
					}
					payload.createNewUserAsAdmin = true;
					payload.newGroupAdminEmail = newAdminEmail.trim();
					payload.newGroupAdminPassword = newAdminPassword;
					payload.newGroupAdminFirstName = newAdminFirstName.trim();
					payload.newGroupAdminLastName = newAdminLastName.trim();
					payload.newGroupAdminZipCode = zip;
				}
				await createGroup(session.client, payload);
				toast.success('Group created');
			}
			open = false;
			onsaved();
			onclose();
		} catch (error) {
			toast.error(errorMessage(error, group ? 'Failed to update group' : 'Failed to create group'));
		} finally {
			saving = false;
		}
	}
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="flex max-h-[90vh] w-[95vw] flex-col sm:max-w-3xl">
		<Dialog.Header>
			<Dialog.Title>{group ? 'Edit group' : 'Create group'}</Dialog.Title>
			<Dialog.Description>
				{group ? group.name : 'Groups bundle access, delays and limits for their members.'}
			</Dialog.Description>
		</Dialog.Header>

		<div class="min-h-0 flex-1 overflow-y-auto pr-1">
			<div class="flex flex-col gap-5">
				<div class="grid gap-3 sm:grid-cols-2">
					<div class="flex flex-col gap-1.5 sm:col-span-2">
						<Label for="group-name">Name</Label>
						<Input id="group-name" bind:value={name} autocomplete="off" />
					</div>
					<div class="flex flex-col gap-1.5 sm:col-span-2">
						<Label for="group-description">Description</Label>
						<Textarea id="group-description" rows={2} bind:value={description} />
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="group-delay">Delay (minutes)</Label>
						<Input id="group-delay" type="number" min={0} bind:value={delay} />
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="group-limit">Connection limit per user</Label>
						<Input id="group-limit" type="number" min={0} bind:value={connectionLimit} placeholder="0 for unlimited" />
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="group-max">Max users</Label>
						<Input id="group-max" type="number" min={0} bind:value={maxUsers} placeholder="0 for unlimited" />
					</div>
				</div>

				<div class="grid gap-2 sm:grid-cols-2">
					<label class="flex items-start gap-2 text-sm">
						<Checkbox class="mt-0.5" checked={isPublicRegistration} onCheckedChange={(v: boolean) => (isPublicRegistration = v)} />
						<span>
							Public registration group
							<span class="block text-xs text-muted-foreground">Self-registered users land here. Only one group can hold this.</span>
						</span>
					</label>
					<label class="flex items-start gap-2 text-sm">
						<Checkbox class="mt-0.5" checked={allowAddExistingUsers} onCheckedChange={(v: boolean) => (allowAddExistingUsers = v)} />
						<span>
							Group admins may add existing users
							<span class="block text-xs text-muted-foreground">Lets group admins pull users from other groups into this one.</span>
						</span>
					</label>
				</div>

				<Separator />

				<div class="flex flex-col gap-2">
					<Label>System and talkgroup access</Label>
					<div class="flex flex-wrap items-center gap-2">
						<Button variant="outline" size="sm" onclick={() => (accessOpen = true)}>
							<KeyRound data-icon="inline-start" />
							{describeAccess(access, systems)}
						</Button>
						<span class="text-xs text-muted-foreground">Members inherit this instead of their own access setting.</span>
					</div>
				</div>

				<DelayOverridesEditor {systems} bind:systemRows bind:talkgroupRows />

				{#if !group}
					<Separator />
					<div class="flex flex-col gap-3">
						<div class="flex flex-col gap-1.5">
							<Label>Group admin</Label>
							<Select type="single" value={adminMode} onValueChange={(v) => (adminMode = (v as AdminMode) || 'none')}>
								<SelectTrigger class="w-full sm:w-80">
									{adminMode === 'existing' ? 'Assign an existing user' : adminMode === 'new' ? 'Create a new user as admin' : 'No admin for now'}
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="none" label="No admin for now" />
									<SelectItem value="existing" label="Assign an existing user" />
									<SelectItem value="new" label="Create a new user as admin" />
								</SelectContent>
							</Select>
						</div>
						{#if adminMode === 'existing'}
							<div class="flex flex-col gap-1.5">
								<Input placeholder="Search users by name or email" bind:value={adminSearch} autocomplete="off" />
								<div class="max-h-48 overflow-y-auto rounded-md border border-border">
									{#if candidateAdmins.length === 0}
										<p class="px-3 py-2 text-sm text-muted-foreground">No matching users.</p>
									{:else}
										<ul class="divide-y divide-border">
											{#each candidateAdmins as user (user.id)}
												<li>
													<button
														type="button"
														class={[
															'flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted/50',
															adminUserId === user.id && 'bg-muted'
														]}
														onclick={() => (adminUserId = user.id)}
													>
														<span class="min-w-0 flex-1 truncate">{userDisplayName(user)}</span>
														<span class="truncate text-xs text-muted-foreground">{user.email}</span>
													</button>
												</li>
											{/each}
										</ul>
									{/if}
								</div>
								{#if selectedAdmin}
									<p class="text-xs text-muted-foreground">Selected: {selectedAdmin.email}</p>
								{/if}
							</div>
						{:else if adminMode === 'new'}
							<div class="grid gap-3 sm:grid-cols-2">
								<div class="flex flex-col gap-1.5 sm:col-span-2">
									<Label for="group-admin-email">Email</Label>
									<Input id="group-admin-email" type="email" bind:value={newAdminEmail} autocomplete="off" />
								</div>
								<div class="flex flex-col gap-1.5 sm:col-span-2">
									<Label for="group-admin-password">Password</Label>
									<Input id="group-admin-password" type="password" bind:value={newAdminPassword} autocomplete="new-password" />
								</div>
								<div class="flex flex-col gap-1.5">
									<Label for="group-admin-first">First name</Label>
									<Input id="group-admin-first" bind:value={newAdminFirstName} autocomplete="off" />
								</div>
								<div class="flex flex-col gap-1.5">
									<Label for="group-admin-last">Last name</Label>
									<Input id="group-admin-last" bind:value={newAdminLastName} autocomplete="off" />
								</div>
								<div class="flex flex-col gap-1.5">
									<Label for="group-admin-zip">ZIP code</Label>
									<Input id="group-admin-zip" bind:value={newAdminZipCode} placeholder="12345" autocomplete="off" />
								</div>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>

		<Dialog.Footer>
			<Button variant="outline" disabled={saving} onclick={() => onOpenChange(false)}>Cancel</Button>
			<Button disabled={saving} onclick={save}>
				{#if saving}
					<Loader2 data-icon="inline-start" class="animate-spin" />
				{/if}
				{group ? 'Save changes' : 'Create group'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<SystemAccessDialog
	{session}
	bind:open={accessOpen}
	value={access}
	title={`Access for ${name.trim() || 'group'}`}
	description="Members of this group can only hear the selected systems and talkgroups."
	onsave={(value) => (access = value)}
/>
