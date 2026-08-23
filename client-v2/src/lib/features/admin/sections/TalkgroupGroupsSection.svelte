<script lang="ts">
	import type { AdminSessionState } from '$lib/core/admin-session.svelte.ts';
	import LabelListEditor, { type DeletePolicy } from './radio/LabelListEditor.svelte';
	import { fetchGroups, groupUsageCounts, putGroups } from './radio/radio-api.ts';
	import type { AdminLabelRow } from './radio/radio-types.ts';

	interface Props {
		session: AdminSessionState;
	}

	let { session }: Props = $props();

	const usage = $derived(groupUsageCounts(session.config?.systems ?? []));

	//* Group membership rows cascade on delete: the talkgroups survive but
	//* drop out of the deleted group, so warn rather than block.
	function deletePolicy(_row: AdminLabelRow, count: number): DeletePolicy {
		if (count === 0) return { mode: 'ok' };
		return {
			mode: 'confirm',
			message: `${count} ${count === 1 ? 'talkgroup belongs' : 'talkgroups belong'} to this group. They will be removed from it when you save (talkgroups in no other group end up ungrouped). The talkgroups themselves are kept.`
		};
	}
</script>

<div class="flex flex-col gap-4">
	<div>
		<h2 class="text-lg font-semibold">Talkgroup Groups</h2>
		<p class="text-sm text-muted-foreground">
			Groups organize talkgroups for toggling on the main screen; a talkgroup can belong to several. Drag or use the arrows to reorder, then Save.
		</p>
	</div>

	<LabelListEditor
		noun="group"
		nounPlural="groups"
		{usage}
		{deletePolicy}
		load={() => fetchGroups(session.client)}
		save={(rows) => putGroups(session.client, rows)}
	/>
</div>
