<script lang="ts">
	import { onMount } from 'svelte';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Spinner } from '$lib/components/ui/spinner/index.ts';
	import LogOut from '@lucide/svelte/icons/log-out';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import { AdminClient } from '$lib/core/admin-client.ts';
	import { AdminSessionState } from '$lib/core/admin-session.svelte.ts';
	import { TlrClient } from '$lib/core/tlr-client.ts';
	import { tlrOrigin } from '$lib/tlr-config.ts';
	import AdminLogin from './AdminLogin.svelte';
	import { AdminSections, DefaultAdminSection } from './admin-sections.ts';

	//* The TlrClient is only used to read the stored user PIN for SSO; it never
	//* opens the listener socket from this page.
	const session = new AdminSessionState(new AdminClient(tlrOrigin()), new TlrClient(tlrOrigin() + '/api/', tlrOrigin()));

	let activeSectionId = $state(DefaultAdminSection);
	const activeSection = $derived(AdminSections.find((section) => section.id === activeSectionId) ?? AdminSections[0]);
	const ActiveComponent = $derived(activeSection.component);

	const socketLabel = $derived.by(() => {
		switch (session.socketStatus) {
			case 'open':
				return 'Live';
			case 'connecting':
				return 'Connecting';
			case 'closed':
				return 'Reconnecting';
			default:
				return 'Offline';
		}
	});

	onMount(() => {
		void session.start();
		return () => session.destroy();
	});
</script>

<svelte:head>
	<title>TLR Admin</title>
</svelte:head>

{#if session.isStarting}
	<div class="flex min-h-[50vh] items-center justify-center">
		<Spinner class="size-8" />
	</div>
{:else if !session.authenticated}
	<AdminLogin {session} />
{:else}
	<div class="mx-auto max-w-6xl space-y-4">
		<header class="flex flex-wrap items-center justify-between gap-2">
			<div class="flex items-center gap-2">
				<ShieldCheck class="size-6 text-primary" />
				<h1 class="text-xl font-semibold">Admin</h1>
				<Badge variant={session.socketStatus === 'open' ? 'default' : 'secondary'}>{socketLabel}</Badge>
				{#if session.config?.version}
					<span class="text-sm text-muted-foreground">v{session.config.version}</span>
				{/if}
			</div>
			<div class="flex items-center gap-2">
				<Button variant="ghost" size="sm" href="/dashboard">Back to app</Button>
				<Button variant="outline" size="sm" onclick={() => session.logout()}><LogOut class="size-4" /> Log out</Button>
			</div>
		</header>

		{#if session.loadError}
			<p class="text-sm text-destructive">{session.loadError}</p>
		{/if}

		<div class="flex flex-col gap-4 md:flex-row">
			<nav class="flex shrink-0 gap-1 overflow-x-auto md:w-48 md:flex-col">
				{#each AdminSections as section (section.id)}
					<Button variant={section.id === activeSectionId ? 'secondary' : 'ghost'} class="justify-start" onclick={() => (activeSectionId = section.id)}>
						<section.icon class="size-4" />
						{section.label}
					</Button>
				{/each}
			</nav>

			<div class="min-w-0 flex-1">
				<ActiveComponent {session} />
			</div>
		</div>
	</div>
{/if}
