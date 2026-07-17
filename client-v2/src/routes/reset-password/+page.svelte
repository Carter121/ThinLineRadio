<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import { toast } from 'svelte-sonner';

	import { TlrClient } from '$lib/core/tlr-client.ts';
	import { tlrOrigin } from '$lib/tlr-config.ts';

	const client = new TlrClient(tlrOrigin() + '/api/', tlrOrigin());

	//* Email links may land here with prefilled params
	const initialCode = page.url.searchParams.get('code') ?? '';
	let email = $state(page.url.searchParams.get('email') ?? '');
	let code = $state(initialCode);
	let step = $state<'request' | 'reset'>(initialCode ? 'reset' : 'request');

	let newPassword = $state('');
	let confirmPassword = $state('');
	let busy = $state(false);
	let error = $state('');

	async function handleRequest(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		error = '';
		try {
			await client.requestPasswordReset(email.trim());
			step = 'reset';
			toast.success('If an account exists for that email, a reset code was sent');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to request password reset';
		} finally {
			busy = false;
		}
	}

	async function handleReset(event: SubmitEvent) {
		event.preventDefault();
		error = '';
		if (newPassword !== confirmPassword) {
			error = 'Passwords do not match';
			return;
		}
		busy = true;
		try {
			await client.resetPassword(email.trim(), code.trim(), newPassword);
			toast.success('Password reset. You can now sign in.');
			await goto('/dashboard');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to reset password';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Reset Password - ThinLine Radio</title>
</svelte:head>

<div class="flex min-h-dvh items-center justify-center px-4 py-8">
	<Card class="w-full max-w-md">
		{#if step === 'request'}
			<CardHeader>
				<CardTitle>Reset your password</CardTitle>
				<CardDescription>Enter your account email and we will send you a reset code.</CardDescription>
			</CardHeader>
			<CardContent>
				<form onsubmit={handleRequest} class="space-y-4">
					{#if error}
						<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
					{/if}
					<div class="space-y-2">
						<Label for="rp-email">Email</Label>
						<Input id="rp-email" type="email" bind:value={email} required autocomplete="email" placeholder="dispatcher@example.com" />
					</div>
					<Button type="submit" class="w-full" disabled={busy}>
						{#if busy}<Loader2 class="size-4 animate-spin" />{/if}
						Send reset code
					</Button>
					<p class="text-center text-sm text-muted-foreground">
						Remembered it?
						<a href="/dashboard" class="font-medium text-primary hover:underline">Back to app</a>
					</p>
				</form>
			</CardContent>
		{:else}
			<CardHeader>
				<CardTitle>Enter your reset code</CardTitle>
				<CardDescription>Use the code we emailed to {email || 'your address'} and pick a new password.</CardDescription>
			</CardHeader>
			<CardContent>
				<form onsubmit={handleReset} class="space-y-4">
					{#if error}
						<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
					{/if}
					{#if !email}
						<div class="space-y-2">
							<Label for="rp-email2">Email</Label>
							<Input id="rp-email2" type="email" bind:value={email} required autocomplete="email" />
						</div>
					{/if}
					<div class="space-y-2">
						<Label for="rp-code">Reset code</Label>
						<Input id="rp-code" bind:value={code} required autocomplete="one-time-code" />
					</div>
					<div class="space-y-2">
						<Label for="rp-new">New password</Label>
						<Input id="rp-new" type="password" bind:value={newPassword} required autocomplete="new-password" />
					</div>
					<div class="space-y-2">
						<Label for="rp-confirm">Confirm new password</Label>
						<Input id="rp-confirm" type="password" bind:value={confirmPassword} required autocomplete="new-password" />
					</div>
					<Button type="submit" class="w-full" disabled={busy}>
						{#if busy}<Loader2 class="size-4 animate-spin" />{/if}
						Reset password
					</Button>
					<Button type="button" variant="ghost" class="w-full" disabled={busy} onclick={() => (step = 'request')}>Request a new code</Button>
				</form>
			</CardContent>
		{/if}
	</Card>
</div>
