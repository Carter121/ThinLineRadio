<script lang="ts">
	import { onMount } from 'svelte';
	import { replaceState } from '$app/navigation';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { Spinner } from '$lib/components/ui/spinner';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import LogOut from '@lucide/svelte/icons/log-out';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import { AdminClient } from '$lib/core/admin-client.ts';
	import { AdminSessionState } from '$lib/core/admin-session.svelte.ts';
	import { TlrClient } from '$lib/core/tlr-client.ts';
	import { tlrOrigin } from '$lib/tlr-config.ts';
	import AdminLogin from './AdminLogin.svelte';
	import { AdminSectionGroups, AdminSections, DefaultAdminSection } from './admin-sections.ts';

	//* The TlrClient is only used to read the stored user PIN for SSO; it never
	//* opens the listener socket from this page.
	const session = new AdminSessionState(new AdminClient(tlrOrigin()), new TlrClient(tlrOrigin() + '/api/', tlrOrigin()));

	//* The active section is mirrored into the URL hash so sections are
	//* deep-linkable and survive a refresh.
	let activeSectionId = $state(DefaultAdminSection);
	const activeSection = $derived(AdminSections.find((section) => section.id === activeSectionId) ?? AdminSections[0]);
	const ActiveComponent = $derived(activeSection.component);

	function selectSection(id: string) {
		activeSectionId = id;
		replaceState(`#${id}`, {});
	}

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

	//* Follows the hash on load and on later hash changes (back/forward, pasted links).
	function syncFromHash() {
		const fromHash = window.location.hash.slice(1);
		if (AdminSections.some((section) => section.id === fromHash)) activeSectionId = fromHash;
	}

	onMount(() => {
		syncFromHash();
		window.addEventListener('hashchange', syncFromHash);
		void session.start();
		return () => {
			window.removeEventListener('hashchange', syncFromHash);
			session.destroy();
		};
	});
</script>

<svelte:head>
	<title>TLR Admin</title>
</svelte:head>

{#if session.isStarting}
	<div class="flex min-h-svh items-center justify-center">
		<Spinner class="size-8" />
	</div>
{:else if !session.authenticated}
	<div class="p-4">
		<AdminLogin {session} />
	</div>
{:else}
	<Sidebar.Provider>
		<Sidebar.Root collapsible="offcanvas">
			<Sidebar.Header>
				<div class="flex items-center gap-2 px-2 py-1.5">
					<ShieldCheck class="size-6 shrink-0 text-primary" />
					<div class="flex min-w-0 flex-col">
						<span class="truncate text-sm font-semibold">{session.config?.branding || 'TLR'} Admin</span>
						{#if session.config?.version}
							<span class="truncate text-xs text-muted-foreground">v{session.config.version}</span>
						{/if}
					</div>
				</div>
			</Sidebar.Header>
			<Sidebar.Content>
				{#each AdminSectionGroups as group (group.id)}
					<Sidebar.Group>
						<Sidebar.GroupLabel>{group.label}</Sidebar.GroupLabel>
						<Sidebar.GroupContent>
							<Sidebar.Menu>
								{#each group.sections as section (section.id)}
									<Sidebar.MenuItem>
										<Sidebar.MenuButton isActive={section.id === activeSectionId} onclick={() => selectSection(section.id)}>
											{#snippet child({ props })}
												<button type="button" {...props}>
													<section.icon />
													<span>{section.label}</span>
												</button>
											{/snippet}
										</Sidebar.MenuButton>
									</Sidebar.MenuItem>
								{/each}
							</Sidebar.Menu>
						</Sidebar.GroupContent>
					</Sidebar.Group>
				{/each}
			</Sidebar.Content>
			<Sidebar.Footer>
				<Sidebar.Menu>
					<Sidebar.MenuItem>
						<Sidebar.MenuButton>
							{#snippet child({ props })}
								<a href="/dashboard" {...props}>
									<ArrowLeft />
									<span>Back to app</span>
								</a>
							{/snippet}
						</Sidebar.MenuButton>
					</Sidebar.MenuItem>
					<Sidebar.MenuItem>
						<Sidebar.MenuButton onclick={() => session.logout()}>
							{#snippet child({ props })}
								<button type="button" {...props}>
									<LogOut />
									<span>Log out</span>
								</button>
							{/snippet}
						</Sidebar.MenuButton>
					</Sidebar.MenuItem>
				</Sidebar.Menu>
			</Sidebar.Footer>
			<Sidebar.Rail />
		</Sidebar.Root>

		<Sidebar.Inset>
			<header class="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur">
				<Sidebar.Trigger />
				<Separator orientation="vertical" class="mr-1 h-5!" />
				<h1 class="text-base font-semibold">{activeSection.label}</h1>
				<Badge variant={session.socketStatus === 'open' ? 'default' : 'secondary'}>{socketLabel}</Badge>
				<div class="ml-auto flex items-center gap-2">
					<Button variant="ghost" size="sm" href="/dashboard" class="hidden sm:inline-flex">Back to app</Button>
					<Button variant="outline" size="sm" onclick={() => session.logout()}>
						<LogOut data-icon="inline-start" />
						Log out
					</Button>
				</div>
			</header>

			<div class="flex flex-1 flex-col gap-4 p-4 lg:p-6">
				{#if session.loadError}
					<p class="text-sm text-destructive">{session.loadError}</p>
				{/if}
				<ActiveComponent {session} {...activeSection.props ?? {}} />
			</div>
		</Sidebar.Inset>
	</Sidebar.Provider>
{/if}
