<script lang="ts">
	import { onDestroy } from 'svelte';
	import { toast } from 'svelte-sonner';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import CloudDownload from '@lucide/svelte/icons/cloud-download';
	import FileCog from '@lucide/svelte/icons/file-cog';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import type { AdminSessionState } from '$lib/core/admin-session.svelte.ts';
	import { TlrApiError } from '$lib/core/tlr-client.ts';
	import { CONFIG_SYNC_FILENAME, applyUpdate, checkForUpdate, reloadConfig, type UpdateInfo } from './tools/tools-api.ts';

	interface Props {
		session: AdminSessionState;
	}

	let { session }: Props = $props();

	const RESTART_POLL_MS = 3000;
	const RESTART_POLL_LIMIT = 60;

	let checking = $state(false);
	let updateInfo = $state.raw<UpdateInfo | null>(null);
	let updateError = $state<string | null>(null);
	let updaterUnavailable = $state(false);
	let applyOpen = $state(false);
	let applying = $state(false);
	let restartTarget = $state<string | null>(null);
	let restartDone = $state(false);
	let restartTimedOut = $state(false);
	let reloading = $state(false);
	let syncing = $state(false);

	let pollTimer: ReturnType<typeof setTimeout> | null = null;

	const currentVersion = $derived(session.config?.version ?? session.loginConfig?.version ?? 'unknown');
	const syncEnabled = $derived(session.options?.configSyncEnabled === true);
	const syncPath = $derived(session.options?.configSyncPath?.trim() ?? '');
	const syncReady = $derived(syncEnabled && syncPath.length > 0);

	async function check() {
		checking = true;
		updateError = null;
		updaterUnavailable = false;
		try {
			updateInfo = await checkForUpdate(session.client);
		} catch (error) {
			updateInfo = null;
			if (error instanceof TlrApiError && error.status === 503) updaterUnavailable = true;
			else updateError = error instanceof Error ? error.message : 'Update check failed';
		} finally {
			checking = false;
		}
	}

	function stopPolling() {
		if (pollTimer) clearTimeout(pollTimer);
		pollTimer = null;
	}

	//* After apply the server restarts and every admin token dies with it; poll
	//* the public login-config until the new version answers.
	function pollRestart(target: string, attempt = 0) {
		stopPolling();
		if (attempt >= RESTART_POLL_LIMIT) {
			restartTimedOut = true;
			return;
		}
		pollTimer = setTimeout(async () => {
			try {
				const config = await session.client.getLoginConfig();
				if (config.version && config.version === target) {
					restartDone = true;
					toast.success(`Server is back online on ${target}. Sign in again to continue.`);
					return;
				}
			} catch {
				//* Still restarting.
			}
			pollRestart(target, attempt + 1);
		}, RESTART_POLL_MS);
	}

	async function apply() {
		applyOpen = false;
		applying = true;
		try {
			const result = await applyUpdate(session.client);
			if (result.to) {
				restartTarget = result.to;
				restartDone = false;
				restartTimedOut = false;
				toast.info(result.message);
				pollRestart(result.to);
			} else {
				toast.info(result.message || 'Already up to date');
				await check();
			}
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to apply update');
		} finally {
			applying = false;
		}
	}

	async function reload() {
		reloading = true;
		try {
			const result = await reloadConfig(session.client);
			await session.refreshConfig();
			toast.success(result.message || 'Configuration reloaded');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to reload configuration');
		} finally {
			reloading = false;
		}
	}

	//* There is no dedicated sync endpoint; any options save triggers
	//* SyncConfigToFile, so re-saving the enable flag writes the file now.
	async function syncNow() {
		syncing = true;
		try {
			await session.saveOptions({ configSyncEnabled: true });
			toast.success(`Config written to ${CONFIG_SYNC_FILENAME}`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to write config file');
		} finally {
			syncing = false;
		}
	}

	onDestroy(stopPolling);
</script>

<div class="flex flex-col gap-4">
	<div>
		<h2 class="text-lg font-semibold">Maintenance</h2>
		<p class="text-sm text-muted-foreground">Server version and updates, configuration reload, and the config sync file.</p>
	</div>

	<Card class="gap-0 py-0">
		<CardHeader class="px-4 pt-4 pb-2">
			<CardTitle class="flex items-center gap-2 text-base">
				<CloudDownload class="size-4" />
				Server version and updates
			</CardTitle>
			<CardDescription>Checks GitHub Releases for a newer server build. Applying an update downloads the release and restarts the server.</CardDescription>
		</CardHeader>
		<CardContent class="flex flex-col gap-3 px-4 pt-0 pb-4">
			<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
				<dt class="text-muted-foreground">Running version</dt>
				<dd class="font-medium tabular-nums">{currentVersion}</dd>
				{#if updateInfo}
					<dt class="text-muted-foreground">Latest release</dt>
					<dd class="flex items-center gap-2 font-medium tabular-nums">
						{updateInfo.latest_version || 'unknown'}
						{#if updateInfo.update_available}
							<Badge>Update available</Badge>
						{:else}
							<Badge variant="secondary">Up to date</Badge>
						{/if}
					</dd>
					<dt class="text-muted-foreground">Platform</dt>
					<dd class="font-medium">{updateInfo.platform}</dd>
				{/if}
			</dl>

			{#if updaterUnavailable}
				<Alert>
					<TriangleAlert />
					<AlertTitle>Auto-update is not available</AlertTitle>
					<AlertDescription>The updater is not initialised on this server build (for example Docker or a source build). Update it the way it was installed.</AlertDescription>
				</Alert>
			{:else if updateError}
				<Alert variant="destructive">
					<TriangleAlert />
					<AlertTitle>Update check failed</AlertTitle>
					<AlertDescription>{updateError}</AlertDescription>
				</Alert>
			{/if}

			{#if restartTarget}
				<Alert>
					{#if restartDone}
						<RefreshCw />
						<AlertTitle>Update applied</AlertTitle>
						<AlertDescription>The server is back on {restartTarget}. Admin sessions were reset by the restart; sign in again.</AlertDescription>
					{:else if restartTimedOut}
						<TriangleAlert />
						<AlertTitle>Still waiting for the server</AlertTitle>
						<AlertDescription>
							The server has not come back on {restartTarget} yet. Check the server logs; if it is running an older version the update may have failed.
						</AlertDescription>
					{:else}
						<Loader2 class="animate-spin" />
						<AlertTitle>Updating to {restartTarget}</AlertTitle>
						<AlertDescription>The server is downloading the release and restarting. This page will notice when it is back.</AlertDescription>
					{/if}
				</Alert>
			{/if}

			<div class="flex flex-wrap items-center gap-2">
				<Button size="sm" variant="outline" disabled={checking || applying} onclick={check}>
					{#if checking}
						<Loader2 data-icon="inline-start" class="animate-spin" />
					{:else}
						<RefreshCw data-icon="inline-start" />
					{/if}
					Check for updates
				</Button>
				{#if updateInfo?.update_available}
					<Button size="sm" disabled={applying || !!restartTarget} onclick={() => (applyOpen = true)}>
						{#if applying}
							<Loader2 data-icon="inline-start" class="animate-spin" />
						{:else}
							<CloudDownload data-icon="inline-start" />
						{/if}
						Apply update to {updateInfo.latest_version}
					</Button>
				{/if}
			</div>
		</CardContent>
	</Card>

	<Card class="gap-0 py-0">
		<CardHeader class="px-4 pt-4 pb-2">
			<CardTitle class="flex items-center gap-2 text-base">
				<RotateCcw class="size-4" />
				Reload configuration
			</CardTitle>
			<CardDescription>
				Re-reads the options table from the database into memory. Useful after editing options outside this panel (another admin, a script, or a
				database restore).
			</CardDescription>
		</CardHeader>
		<CardContent class="px-4 pt-0 pb-4">
			<Button size="sm" variant="outline" disabled={reloading} onclick={reload}>
				{#if reloading}
					<Loader2 data-icon="inline-start" class="animate-spin" />
				{:else}
					<RotateCcw data-icon="inline-start" />
				{/if}
				Reload from database
			</Button>
		</CardContent>
	</Card>

	<Card class="gap-0 py-0">
		<CardHeader class="px-4 pt-4 pb-2">
			<CardTitle class="flex items-center gap-2 text-base">
				<FileCog class="size-4" />
				Config sync to file
			</CardTitle>
			<CardDescription>
				When enabled, the server writes the full config (same content as an export) to {CONFIG_SYNC_FILENAME} inside the sync folder after every
				configuration change. Enable it and set the folder under Server &gt; General.
			</CardDescription>
		</CardHeader>
		<CardContent class="flex flex-col gap-3 px-4 pt-0 pb-4">
			<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
				<dt class="text-muted-foreground">Status</dt>
				<dd>
					{#if syncReady}
						<Badge>Enabled</Badge>
					{:else if syncEnabled}
						<Badge variant="secondary">Enabled, no folder set</Badge>
					{:else}
						<Badge variant="secondary">Disabled</Badge>
					{/if}
				</dd>
				<dt class="text-muted-foreground">Folder</dt>
				<dd class="font-mono text-xs break-all">{syncPath || '-'}</dd>
				<dt class="text-muted-foreground">File</dt>
				<dd class="font-mono text-xs">{CONFIG_SYNC_FILENAME}</dd>
			</dl>
			<div class="flex flex-wrap items-center gap-2">
				<Button size="sm" variant="outline" disabled={!syncReady || syncing} onclick={syncNow}>
					{#if syncing}
						<Loader2 data-icon="inline-start" class="animate-spin" />
					{:else}
						<FileCog data-icon="inline-start" />
					{/if}
					Write file now
				</Button>
				<span class="text-xs text-muted-foreground">Re-saves the sync setting, which makes the server write the file immediately.</span>
			</div>
		</CardContent>
	</Card>
</div>

<AlertDialog.Root bind:open={applyOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Apply update to {updateInfo?.latest_version}?</AlertDialog.Title>
			<AlertDialog.Description>
				The server downloads the release, replaces its binary and restarts. Live audio and alerts drop for a short time, and every admin session
				(including this one) is signed out by the restart.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action onclick={apply}>Apply update</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
