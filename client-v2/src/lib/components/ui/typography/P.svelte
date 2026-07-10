<script lang="ts">
	import { cn } from '$lib/utils/shadcn.ts';
	import type { TypographyProps } from '$lib/components/ui/typography/typography.ts';

	let { class: className, children }: TypographyProps = $props();
</script>

<p class={cn(className, 'leading-7 not-first:mt-6')}>
	{@render children?.()}
</p>
