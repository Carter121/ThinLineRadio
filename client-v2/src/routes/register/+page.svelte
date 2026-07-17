<script lang="ts">
	import { goto } from '$app/navigation';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import MailCheck from '@lucide/svelte/icons/mail-check';
	import { toast } from 'svelte-sonner';

	import { TlrClient } from '$lib/apps/tlr/tlr-client.ts';
	import { tlrOrigin } from '$lib/tlr-config.ts';
	import type { RegistrationSettings } from '$lib/apps/tlr/types.ts';

	const client = new TlrClient(tlrOrigin() + '/api/', tlrOrigin());

	//* form -> code (email verification step) -> check-email (link verification fallback)
	let step = $state<'form' | 'code' | 'check-email'>('form');
	let settings = $state<RegistrationSettings | null>(null);

	let firstName = $state('');
	let lastName = $state('');
	let email = $state('');
	let zipCode = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let accessCode = $state('');
	let verificationCode = $state('');

	let busy = $state(false);
	let error = $state('');

	$effect(() => {
		void client
			.getRegistrationSettings()
			.then((s) => (settings = s))
			.catch(() => {
				//* Leave settings null; the form still works with server-side validation
			});
	});

	function validateForm(): string {
		if (!firstName.trim() || !lastName.trim() || !email.trim() || !zipCode.trim() || !password) {
			return 'All fields are required';
		}
		if (password !== confirmPassword) {
			return 'Passwords do not match';
		}
		return '';
	}

	async function handleFormSubmit(event: SubmitEvent) {
		event.preventDefault();
		error = validateForm();
		if (error) return;

		//* With an access code the code itself proves identity; no email code needed
		if (settings?.emailVerificationRequired && !accessCode.trim()) {
			busy = true;
			try {
				await client.requestSignupVerification(email.trim());
				step = 'code';
			} catch (err) {
				error = err instanceof Error ? err.message : 'Failed to send verification code';
			} finally {
				busy = false;
			}
			return;
		}

		await submitRegistration();
	}

	async function handleCodeSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!verificationCode.trim()) {
			error = 'Enter the code from your email';
			return;
		}
		await submitRegistration();
	}

	async function submitRegistration() {
		busy = true;
		error = '';
		try {
			const response = await client.register({
				email: email.trim(),
				password,
				firstName: firstName.trim(),
				lastName: lastName.trim(),
				zipCode: zipCode.trim(),
				accessCode: accessCode.trim() || undefined,
				verificationCode: verificationCode.trim() || undefined
			});
			if (response.verified) {
				toast.success('Account created. Welcome!');
				await goto('/dashboard');
			} else {
				step = 'check-email';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Registration failed';
		} finally {
			busy = false;
		}
	}

	async function resend() {
		busy = true;
		try {
			await client.resendVerification(email.trim());
			toast.success('Verification email sent');
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to resend verification email');
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Create Account - ThinLine Radio</title>
</svelte:head>

<div class="flex min-h-dvh items-center justify-center px-4 py-8">
	<Card class="w-full max-w-md">
		{#if step === 'check-email'}
			<CardHeader>
				<CardTitle class="flex items-center gap-2"><MailCheck class="size-5" /> Check your email</CardTitle>
				<CardDescription>
					We sent a verification link to {email}. Open it to activate your account, then come back and sign in.
				</CardDescription>
			</CardHeader>
			<CardContent class="space-y-3">
				<Button variant="outline" class="w-full" disabled={busy} onclick={resend}>Resend verification email</Button>
				<Button variant="ghost" class="w-full" onclick={() => goto('/dashboard')}>Back to app</Button>
			</CardContent>
		{:else if step === 'code'}
			<CardHeader>
				<CardTitle>Verify your email</CardTitle>
				<CardDescription>We sent a verification code to {email}. Enter it below to finish creating your account.</CardDescription>
			</CardHeader>
			<CardContent>
				<form onsubmit={handleCodeSubmit} class="space-y-4">
					{#if error}
						<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
					{/if}
					<div class="space-y-2">
						<Label for="reg-code">Verification code</Label>
						<Input id="reg-code" bind:value={verificationCode} required autocomplete="one-time-code" placeholder="123456" />
					</div>
					<Button type="submit" class="w-full" disabled={busy}>
						{#if busy}<Loader2 class="size-4 animate-spin" />{/if}
						Create account
					</Button>
					<Button type="button" variant="ghost" class="w-full" disabled={busy} onclick={() => (step = 'form')}>Back</Button>
				</form>
			</CardContent>
		{:else}
			<CardHeader>
				<CardTitle>Create your account</CardTitle>
				<CardDescription>Sign up for ThinLine Radio to unlock alerts, transcripts, and live audio.</CardDescription>
			</CardHeader>
			<CardContent>
				<form onsubmit={handleFormSubmit} class="space-y-4">
					{#if error}
						<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
					{/if}

					<div class="grid grid-cols-2 gap-3">
						<div class="space-y-2">
							<Label for="reg-first">First name</Label>
							<Input id="reg-first" bind:value={firstName} required autocomplete="given-name" />
						</div>
						<div class="space-y-2">
							<Label for="reg-last">Last name</Label>
							<Input id="reg-last" bind:value={lastName} required autocomplete="family-name" />
						</div>
					</div>

					<div class="space-y-2">
						<Label for="reg-email">Email</Label>
						<Input id="reg-email" type="email" bind:value={email} required autocomplete="email" placeholder="dispatcher@example.com" />
					</div>

					<div class="space-y-2">
						<Label for="reg-zip">ZIP code</Label>
						<Input id="reg-zip" bind:value={zipCode} required autocomplete="postal-code" inputmode="numeric" />
					</div>

					<div class="space-y-2">
						<Label for="reg-password">Password</Label>
						<Input id="reg-password" type="password" bind:value={password} required autocomplete="new-password" />
					</div>

					<div class="space-y-2">
						<Label for="reg-confirm">Confirm password</Label>
						<Input id="reg-confirm" type="password" bind:value={confirmPassword} required autocomplete="new-password" />
					</div>

					<div class="space-y-2">
						<Label for="reg-access">
							Access code
							{#if settings == null || settings.publicRegistrationEnabled}
								<span class="text-muted-foreground">(optional)</span>
							{/if}
						</Label>
						<Input id="reg-access" bind:value={accessCode} required={settings != null && !settings.publicRegistrationEnabled} autocomplete="off" />
						{#if settings != null && !settings.publicRegistrationEnabled}
							<p class="text-xs text-muted-foreground">Registration is invite-only. Enter the invitation or registration code you received.</p>
						{/if}
					</div>

					<Button type="submit" class="w-full" disabled={busy}>
						{#if busy}<Loader2 class="size-4 animate-spin" />{/if}
						{settings?.emailVerificationRequired && !accessCode.trim() ? 'Continue' : 'Create account'}
					</Button>

					<p class="text-center text-sm text-muted-foreground">
						Already have an account?
						<a href="/dashboard" class="font-medium text-primary hover:underline">Sign in</a>
					</p>
				</form>
			</CardContent>
		{/if}
	</Card>
</div>
