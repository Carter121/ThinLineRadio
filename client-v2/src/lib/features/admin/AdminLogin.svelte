<script lang="ts">
	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card/index.ts';
	import { Input } from '$lib/components/ui/input/index.ts';
	import { Label } from '$lib/components/ui/label/index.ts';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import type { AdminSessionState } from '$lib/core/admin-session.svelte.ts';

	interface Props {
		session: AdminSessionState;
	}

	let { session }: Props = $props();
	let password = $state('');

	const passwordLoginDisabled = $derived(session.loginConfig?.adminPasswordLoginDisabled ?? false);

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		await session.loginWithPassword(password);
		if (session.authenticated) password = '';
	}
</script>

<div class="mx-auto flex min-h-[70vh] max-w-md items-center">
	<Card class="w-full">
		<CardHeader>
			<CardTitle class="flex items-center gap-2"><ShieldCheck class="size-5" /> Admin Login</CardTitle>
			<CardDescription>
				{#if passwordLoginDisabled}
					Password login is disabled. Sign in with a system admin account.
				{:else}
					Enter the admin password to manage this server.
				{/if}
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			{#if session.authError}
				<Alert variant="destructive">
					<AlertDescription>{session.authError}</AlertDescription>
				</Alert>
			{/if}

			{#if !passwordLoginDisabled}
				<form onsubmit={handleSubmit} class="space-y-4">
					<div class="space-y-2">
						<Label for="admin-password">Admin password</Label>
						<Input id="admin-password" type="password" bind:value={password} required autocomplete="current-password" />
					</div>
					<Button type="submit" class="w-full" disabled={session.isLoggingIn}>
						{session.isLoggingIn ? 'Logging in...' : 'Log In'}
					</Button>
				</form>
			{/if}

			{#if session.ssoAvailable}
				<Button
					variant={passwordLoginDisabled ? 'default' : 'outline'}
					class="w-full"
					disabled={session.isLoggingIn}
					onclick={() => session.loginWithSso()}
				>
					<KeyRound class="size-4" /> Sign in with my TLR account
				</Button>
			{:else if passwordLoginDisabled}
				<p class="text-sm text-muted-foreground">Log into the main UI first with a system admin account, then return here.</p>
			{/if}

			<div class="flex items-center justify-between text-sm text-muted-foreground">
				<a href="/dashboard" class="hover:text-foreground hover:underline">Back to dashboard</a>
				{#if session.loginConfig?.version}
					<span>v{session.loginConfig.version}</span>
				{/if}
			</div>
		</CardContent>
	</Card>
</div>
