<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import Eye from '@lucide/svelte/icons/eye';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import Save from '@lucide/svelte/icons/save';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import type { AdminSessionState } from '$lib/core/admin-session.svelte.ts';
	import { TlrApiError } from '$lib/core/tlr-client.ts';
	import { changeAdminPassword } from './tools/tools-api.ts';

	interface Props {
		session: AdminSessionState;
	}

	let { session }: Props = $props();

	const MIN_LENGTH = 8;

	let currentPassword = $state('');
	let newPassword = $state('');
	let verifyPassword = $state('');
	let reveal = $state(false);
	let saving = $state(false);
	let touched = $state(false);

	const tooShort = $derived(newPassword.length > 0 && newPassword.length < MIN_LENGTH);
	const mismatch = $derived(verifyPassword.length > 0 && verifyPassword !== newPassword);
	const sameAsCurrent = $derived(newPassword.length > 0 && newPassword === currentPassword);
	const canSave = $derived(
		!saving && currentPassword.length > 0 && newPassword.length >= MIN_LENGTH && verifyPassword === newPassword && !sameAsCurrent
	);

	function reset() {
		currentPassword = '';
		newPassword = '';
		verifyPassword = '';
		touched = false;
	}

	async function save() {
		if (!canSave) return;
		saving = true;
		try {
			const result = await changeAdminPassword(session.client, currentPassword, newPassword);
			//* The server recomputes passwordNeedChange (true only if the new
			//* password equals the built-in default).
			session.passwordNeedChange = result.passwordNeedChange;
			toast.success('Admin password changed');
			reset();
		} catch (error) {
			if (error instanceof TlrApiError && error.status === 417) {
				toast.error('Current password is incorrect');
			} else {
				toast.error(error instanceof Error ? error.message : 'Unable to change password');
			}
		} finally {
			saving = false;
		}
	}
</script>

<div class="flex flex-col gap-4">
	<div>
		<h2 class="text-lg font-semibold">Admin Password</h2>
		<p class="text-sm text-muted-foreground">
			The password for this admin panel. Access controls (localhost-only, IP allow list, disabling password login) live under Server &gt; General.
		</p>
	</div>

	{#if session.passwordNeedChange}
		<Alert variant="destructive">
			<TriangleAlert />
			<AlertTitle>The admin password is still the default</AlertTitle>
			<AlertDescription>Anyone who knows the default can administer this server. Set a new password now.</AlertDescription>
		</Alert>
	{/if}

	<Card class="max-w-xl gap-0 py-0">
		<CardHeader class="px-4 pt-4 pb-2">
			<CardTitle class="flex items-center gap-2 text-base">
				<KeyRound class="size-4" />
				Change password
			</CardTitle>
			<CardDescription>At least {MIN_LENGTH} characters. Other signed-in admin sessions keep working until they log out or the server restarts.</CardDescription>
		</CardHeader>
		<CardContent class="px-4 pt-0 pb-4">
			<form
				class="flex flex-col gap-4"
				onsubmit={(event) => {
					event.preventDefault();
					void save();
				}}
			>
				<div class="flex flex-col gap-1.5">
					<Label for="admin-current-password">Current password</Label>
					<Input
						id="admin-current-password"
						type={reveal ? 'text' : 'password'}
						autocomplete="current-password"
						bind:value={currentPassword}
						disabled={saving}
						required
					/>
				</div>
				<div class="flex flex-col gap-1.5">
					<Label for="admin-new-password">New password</Label>
					<Input
						id="admin-new-password"
						type={reveal ? 'text' : 'password'}
						autocomplete="new-password"
						bind:value={newPassword}
						oninput={() => (touched = true)}
						disabled={saving}
						aria-invalid={tooShort || sameAsCurrent}
						required
					/>
					{#if tooShort}
						<p class="text-xs text-destructive">Password must be at least {MIN_LENGTH} characters.</p>
					{:else if sameAsCurrent}
						<p class="text-xs text-destructive">New password must differ from the current one.</p>
					{/if}
				</div>
				<div class="flex flex-col gap-1.5">
					<Label for="admin-verify-password">Verify new password</Label>
					<Input
						id="admin-verify-password"
						type={reveal ? 'text' : 'password'}
						autocomplete="new-password"
						bind:value={verifyPassword}
						oninput={() => (touched = true)}
						disabled={saving}
						aria-invalid={mismatch}
						required
					/>
					{#if mismatch}
						<p class="text-xs text-destructive">Passwords do not match.</p>
					{/if}
				</div>
				<div class="flex flex-wrap items-center gap-2">
					<Button type="submit" size="sm" disabled={!canSave}>
						{#if saving}
							<Loader2 data-icon="inline-start" class="animate-spin" />
						{:else}
							<Save data-icon="inline-start" />
						{/if}
						Save
					</Button>
					<Button type="button" size="sm" variant="outline" disabled={saving || (!touched && !currentPassword)} onclick={reset}>Reset</Button>
					<Button type="button" size="sm" variant="ghost" class="ml-auto" onclick={() => (reveal = !reveal)} aria-pressed={reveal}>
						{#if reveal}
							<EyeOff data-icon="inline-start" />
							Hide
						{:else}
							<Eye data-icon="inline-start" />
							Show
						{/if}
					</Button>
				</div>
			</form>
		</CardContent>
	</Card>
</div>
