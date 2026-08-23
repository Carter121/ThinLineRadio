<script lang="ts">
	import { untrack } from 'svelte';
	import { DateTime } from 'luxon';
	import { toast } from 'svelte-sonner';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import { Separator } from '$lib/components/ui/separator';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import type { AdminSessionState } from '$lib/core/admin-session.svelte.ts';
	import { errorMessage, updateUser } from './access-api.ts';
	import {
		describeAccess,
		parseAccess,
		parseDelayMap,
		serializeDelayMap,
		serializeUserAccess,
		toPickerSystems,
		type AccessSystems,
		type AdminUserGroupRecord,
		type AdminUserRecord,
		type UserUpdatePayload
	} from './access-types.ts';
	import DelayOverridesEditor, { type SystemDelayRow, type TalkgroupDelayRow } from './DelayOverridesEditor.svelte';
	import SystemAccessDialog from './SystemAccessDialog.svelte';

	interface Props {
		session: AdminSessionState;
		user: AdminUserRecord;
		groups: AdminUserGroupRecord[];
		onclose: () => void;
		onsaved: () => void;
	}

	let { session, user, groups, onclose, onsaved }: Props = $props();

	//* The parent mounts this dialog fresh per user, so the draft is seeded once.
	const initial = untrack(() => $state.snapshot(user));
	let open = $state(true);
	let saving = $state(false);
	let accessOpen = $state(false);

	let email = $state(initial.email);
	let firstName = $state(initial.firstName ?? '');
	let lastName = $state(initial.lastName ?? '');
	let zipCode = $state(initial.zipCode ?? '');
	let verified = $state(!!initial.verified);
	let systemAdmin = $state(!!initial.systemAdmin);
	let userGroupId = $state(initial.userGroupId ?? 0);
	let isGroupAdmin = $state(!!initial.isGroupAdmin);
	let delay = $state(initial.delay ?? 0);
	let connectionLimit = $state(initial.connectionLimit ?? 0);
	let forcePasswordReset = $state(!!initial.forcePasswordReset);
	let pushSystemNoAudioAlerts = $state(!!initial.pushSystemNoAudioAlerts);
	let pushApiKeyNoAudioAlerts = $state(!!initial.pushApiKeyNoAudioAlerts);
	let pin = $state(initial.pin ?? '');
	let regeneratePin = $state(false);
	let pinExpiresAt = $state(initial.pinExpiresAt > 0 ? (DateTime.fromSeconds(initial.pinExpiresAt).toFormat("yyyy-MM-dd'T'HH:mm") ?? '') : '');
	let access = $state<AccessSystems>(parseAccess(initial.systems));
	let systemRows = $state<SystemDelayRow[]>(
		Object.entries(parseDelayMap(initial.systemDelays)).map(([key, value]) => ({ systemRef: Number(key), delay: value }))
	);
	let talkgroupRows = $state<TalkgroupDelayRow[]>(
		Object.entries(parseDelayMap(initial.talkgroupDelays)).map(([key, value]) => {
			const [systemRef, talkgroupRef] = key.split(':').map(Number);
			return { systemRef: systemRef || 0, talkgroupRef: talkgroupRef || 0, delay: value };
		})
	);

	const systems = $derived(toPickerSystems(session.config?.systems));
	const selectedGroup = $derived(groups.find((g) => g.id === userGroupId) ?? null);

	function onOpenChange(next: boolean) {
		open = next;
		if (!next) onclose();
	}

	function nonNegative(value: unknown): number {
		const parsed = Number(value);
		return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
	}

	async function save() {
		if (!email.trim()) {
			toast.error('Email is required');
			return;
		}
		const zip = zipCode.trim();
		if (zip && !/^\d{5}(-\d{4})?$/.test(zip)) {
			toast.error('ZIP code must be 12345 or 12345-6789');
			return;
		}
		const systemDelays: Record<string, number> = {};
		for (const row of systemRows) if (row.systemRef && row.delay > 0) systemDelays[String(row.systemRef)] = row.delay;
		const talkgroupDelays: Record<string, number> = {};
		for (const row of talkgroupRows) {
			if (row.systemRef && row.talkgroupRef && row.delay > 0) talkgroupDelays[`${row.systemRef}:${row.talkgroupRef}`] = row.delay;
		}
		let expires = 0;
		if (pinExpiresAt.trim()) {
			const parsed = DateTime.fromISO(pinExpiresAt);
			if (parsed.isValid) expires = Math.floor(parsed.toSeconds());
		}

		const payload: UserUpdatePayload = {
			email: email.trim(),
			firstName: firstName.trim(),
			lastName: lastName.trim(),
			zipCode: zip,
			verified,
			systems: serializeUserAccess(access),
			delay: nonNegative(delay),
			systemDelays: serializeDelayMap(systemDelays),
			talkgroupDelays: serializeDelayMap(talkgroupDelays),
			connectionLimit: nonNegative(connectionLimit),
			pinExpiresAt: expires,
			userGroupId: nonNegative(userGroupId),
			isGroupAdmin: userGroupId > 0 ? isGroupAdmin : false,
			systemAdmin,
			pushSystemNoAudioAlerts,
			pushApiKeyNoAudioAlerts,
			forcePasswordReset,
			//* Echoed so the server does not blank them; never edited here.
			stripeCustomerId: user.stripeCustomerId ?? '',
			stripeSubscriptionId: user.stripeSubscriptionId ?? '',
			subscriptionStatus: user.subscriptionStatus ?? ''
		};
		if (regeneratePin) payload.regeneratePin = true;
		else if (pin.trim() !== (user.pin ?? '')) payload.pin = pin.trim();

		saving = true;
		try {
			await updateUser(session.client, user.id, payload);
			toast.success(regeneratePin || payload.pin === '' ? 'User updated with a new PIN' : 'User updated');
			open = false;
			onsaved();
			onclose();
		} catch (error) {
			toast.error(errorMessage(error, 'Failed to update user'));
		} finally {
			saving = false;
		}
	}
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="flex max-h-[90vh] w-[95vw] flex-col sm:max-w-3xl">
		<Dialog.Header>
			<Dialog.Title>Edit user</Dialog.Title>
			<Dialog.Description>{user.email}</Dialog.Description>
		</Dialog.Header>

		<div class="min-h-0 flex-1 overflow-y-auto pr-1">
			<div class="flex flex-col gap-5">
				<div class="grid gap-3 sm:grid-cols-2">
					<div class="flex flex-col gap-1.5 sm:col-span-2">
						<Label for="user-email">Email</Label>
						<Input id="user-email" type="email" bind:value={email} autocomplete="off" />
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="user-first">First name</Label>
						<Input id="user-first" bind:value={firstName} autocomplete="off" />
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="user-last">Last name</Label>
						<Input id="user-last" bind:value={lastName} autocomplete="off" />
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="user-zip">ZIP code</Label>
						<Input id="user-zip" bind:value={zipCode} placeholder="12345" autocomplete="off" />
					</div>
					<div class="flex flex-col gap-1.5">
						<Label>User group</Label>
						<Select
							type="single"
							value={String(userGroupId)}
							onValueChange={(v) => {
								userGroupId = Number(v) || 0;
								if (!userGroupId) isGroupAdmin = false;
							}}
						>
							<SelectTrigger class="w-full">{selectedGroup?.name ?? 'No group (unassigned)'}</SelectTrigger>
							<SelectContent>
								<SelectItem value="0" label="No group (unassigned)" />
								{#each groups as group (group.id)}
									<SelectItem value={String(group.id)} label={group.name} />
								{/each}
							</SelectContent>
						</Select>
					</div>
				</div>

				<Separator />

				<div class="grid gap-3 sm:grid-cols-2">
					<div class="flex flex-col gap-1.5">
						<Label for="user-pin">PIN</Label>
						<div class="flex items-center gap-2">
							<Input
								id="user-pin"
								class="font-mono"
								bind:value={pin}
								disabled={regeneratePin}
								placeholder={regeneratePin ? 'A new PIN will be generated' : 'Leave blank to generate a new one'}
								autocomplete="off"
							/>
							<Button
								variant={regeneratePin ? 'secondary' : 'outline'}
								size="sm"
								onclick={() => {
									regeneratePin = !regeneratePin;
									if (!regeneratePin) pin = user.pin ?? '';
								}}
							>
								<RefreshCw data-icon="inline-start" />
								{regeneratePin ? 'Keep current' : 'Regenerate'}
							</Button>
						</div>
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="user-pin-expires">PIN expiration</Label>
						<Input id="user-pin-expires" type="datetime-local" bind:value={pinExpiresAt} />
						<p class="text-xs text-muted-foreground">Leave blank for no expiration.</p>
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="user-delay">Delay (minutes)</Label>
						<Input id="user-delay" type="number" min={0} bind:value={delay} />
						{#if selectedGroup}
							<p class="text-xs text-muted-foreground">Group settings apply while the user is in a group.</p>
						{/if}
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="user-limit">Connection limit</Label>
						<Input id="user-limit" type="number" min={0} bind:value={connectionLimit} placeholder="0 for unlimited" />
						{#if selectedGroup && selectedGroup.connectionLimit > 0}
							<p class="text-xs text-muted-foreground">Group limit of {selectedGroup.connectionLimit} takes precedence.</p>
						{/if}
					</div>
				</div>

				<Separator />

				<div class="flex flex-col gap-2">
					<Label>System and talkgroup access</Label>
					<div class="flex flex-wrap items-center gap-2">
						<Button variant="outline" size="sm" onclick={() => (accessOpen = true)}>
							<KeyRound data-icon="inline-start" />
							{describeAccess(access, systems)}
						</Button>
						<span class="text-xs text-muted-foreground">Applies when the user is not in a group; group access wins otherwise.</span>
					</div>
				</div>

				<DelayOverridesEditor {systems} bind:systemRows bind:talkgroupRows />

				<Separator />

				<div class="grid gap-2 sm:grid-cols-2">
					<label class="flex items-center gap-2 text-sm">
						<Checkbox checked={verified} onCheckedChange={(v: boolean) => (verified = v)} />
						Email verified
					</label>
					<label class="flex items-center gap-2 text-sm">
						<Checkbox checked={systemAdmin} onCheckedChange={(v: boolean) => (systemAdmin = v)} />
						System admin
					</label>
					<label class={['flex items-center gap-2 text-sm', !userGroupId && 'opacity-60']}>
						<Checkbox checked={isGroupAdmin} disabled={!userGroupId} onCheckedChange={(v: boolean) => (isGroupAdmin = v)} />
						Group admin {#if !userGroupId}<span class="text-xs text-muted-foreground">(needs a group)</span>{/if}
					</label>
					<label class="flex items-center gap-2 text-sm">
						<Checkbox checked={forcePasswordReset} onCheckedChange={(v: boolean) => (forcePasswordReset = v)} />
						Require password reset on next login
					</label>
					<label class="flex items-center gap-2 text-sm">
						<Checkbox checked={pushSystemNoAudioAlerts} onCheckedChange={(v: boolean) => (pushSystemNoAudioAlerts = v)} />
						Push: system no-audio alerts
					</label>
					<label class="flex items-center gap-2 text-sm">
						<Checkbox checked={pushApiKeyNoAudioAlerts} onCheckedChange={(v: boolean) => (pushApiKeyNoAudioAlerts = v)} />
						Push: API key no-audio alerts
					</label>
				</div>
			</div>
		</div>

		<Dialog.Footer>
			<Button variant="outline" disabled={saving} onclick={() => onOpenChange(false)}>Cancel</Button>
			<Button disabled={saving} onclick={save}>
				{#if saving}
					<Loader2 data-icon="inline-start" class="animate-spin" />
				{/if}
				Save changes
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<SystemAccessDialog
	{session}
	bind:open={accessOpen}
	value={access}
	title={`Access for ${user.email}`}
	onsave={(value) => (access = value)}
/>
