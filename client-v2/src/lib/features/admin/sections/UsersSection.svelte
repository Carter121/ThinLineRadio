<script lang="ts">
	import type { AdminSessionState } from '$lib/core/admin-session.svelte.ts';

	interface Props {
		session: AdminSessionState;
	}

	let { session }: Props = $props();
</script>

<div class="flex flex-col gap-4">
	<div>
		<h2 class="text-lg font-semibold">Users</h2>
		<p class="text-sm text-muted-foreground">This section is being ported from the old admin. Use the old admin at /old-site/admin for now.</p>
	</div>
</div>
