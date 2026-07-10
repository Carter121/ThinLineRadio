<script lang="ts">
	import { cn } from '$lib/utils/shadcn.ts';
	import type { TypographyProps } from '$lib/components/ui/typography/typography.ts';

	let { class: className, children }: TypographyProps = $props();
</script>

<blockquote class={cn(className, 'mt-6 border-l-2 pl-6 italic')}>
	{@render children?.()}
</blockquote>
