<script lang="ts">
	import type { AdminSessionState } from '$lib/core/admin-session.svelte.ts';
	import SystemOverridesTable from './SystemOverridesTable.svelte';

	interface Props {
		session: AdminSessionState;
	}

	let { session }: Props = $props();
</script>

<div class="flex flex-col gap-4">
	<div>
		<h2 class="text-lg font-semibold">System Overrides</h2>
		<p class="text-sm text-muted-foreground">Per-system settings that override the global defaults. Changes save immediately.</p>
	</div>
	<SystemOverridesTable {session} />
</div>
