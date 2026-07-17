<script lang="ts">
	import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '$lib/components/ui/dialog/index.ts';
	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Input } from '$lib/components/ui/input/index.ts';
	import { Label } from '$lib/components/ui/label/index.ts';
	import { TlrApiError, type TlrClient } from '$lib/core/tlr-client.ts';
	import { toast } from 'svelte-sonner';

	interface LoginHandler {
		isLoggingIn: boolean;
		onLoginSuccess(): Promise<void>;
	}

	interface Props {
		client: TlrClient;
		dashboardState: LoginHandler;
		open: boolean;
	}

	let { client, dashboardState, open = $bindable(false) }: Props = $props();
	let email = $state('');
	let password = $state('');
	let error = $state('');

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		error = '';
		dashboardState.isLoggingIn = true;

		try {
			await client.login(email, password);
			await dashboardState.onLoginSuccess();
			open = false;
			email = '';
			password = '';
			toast.success('Logged in successfully');
		} catch (err) {
			if (err instanceof TlrApiError && err.status === 429) {
				error = 'Too many login attempts. Please wait 15 minutes.';
			} else if (err instanceof Error) {
				error = err.message;
			} else {
				error = 'Login failed';
			}
		} finally {
			dashboardState.isLoggingIn = false;
		}
	}
</script>

<Dialog bind:open>
	<DialogContent class="sm:max-w-md">
		<DialogHeader>
			<DialogTitle>TLR Login</DialogTitle>
			<DialogDescription>Sign in with your ThinLineRadio account to unlock alerts, transcripts, and system alerts.</DialogDescription>
		</DialogHeader>

		<form onsubmit={handleSubmit} class="space-y-4">
			{#if error}
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			{/if}

			<div class="space-y-2">
				<Label for="tlr-email">Email</Label>
				<Input id="tlr-email" type="email" bind:value={email} required autocomplete="email" placeholder="dispatcher@example.com" />
			</div>

			<div class="space-y-2">
				<Label for="tlr-password">Password</Label>
				<Input id="tlr-password" type="password" bind:value={password} required autocomplete="current-password" />
			</div>

			<DialogFooter>
				<Button type="submit" class="w-full" disabled={dashboardState.isLoggingIn}>
					{#if dashboardState.isLoggingIn}
						Logging in...
					{:else}
						Log In
					{/if}
				</Button>
			</DialogFooter>

			<div class="flex items-center justify-between text-sm">
				<a href="/reset-password" class="text-muted-foreground hover:text-foreground hover:underline">Forgot password?</a>
				<a href="/register" class="font-medium text-primary hover:underline">Create an account</a>
			</div>
		</form>
	</DialogContent>
</Dialog>
