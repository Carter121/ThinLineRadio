<script lang="ts">
	import type { AdminSessionState } from '$lib/core/admin-session.svelte.ts';
	import LabelListEditor, { type DeletePolicy } from './radio/LabelListEditor.svelte';
	import { fetchTags, putTags, tagUsageCounts } from './radio/radio-api.ts';
	import type { AdminLabelRow } from './radio/radio-types.ts';

	interface Props {
		session: AdminSessionState;
	}

	let { session }: Props = $props();

	const usage = $derived(tagUsageCounts(session.config?.systems ?? []));

	//* talkgroups.tagId is ON DELETE CASCADE: deleting a tag in use would delete
	//* those talkgroups and, through them, their calls and alerts. Block it.
	function deletePolicy(_row: AdminLabelRow, count: number): DeletePolicy {
		if (count === 0) return { mode: 'ok' };
		return {
			mode: 'block',
			message: `${count} ${count === 1 ? 'talkgroup uses' : 'talkgroups use'} this tag. Deleting it would permanently delete those talkgroups along with their calls and alerts. Reassign them to another tag in Systems first.`
		};
	}
</script>

<div class="flex flex-col gap-4">
	<div>
		<h2 class="text-lg font-semibold">Tags</h2>
		<p class="text-sm text-muted-foreground">
			Every talkgroup is assigned one tag; tags filter calls on the main screen. The "Untagged" tag is the fallback for imports that carry no tag.
			Drag or use the arrows to reorder, then Save.
		</p>
	</div>

	<LabelListEditor
		noun="tag"
		nounPlural="tags"
		showColor
		{usage}
		{deletePolicy}
		load={() => fetchTags(session.client)}
		save={(rows) => putTags(session.client, rows)}
	/>
</div>
