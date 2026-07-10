<script lang="ts">
	import { cn } from '$lib/utils/shadcn.ts';
	import type { TypographyProps } from '$lib/components/ui/typography/typography.ts';

	let { class: className, children }: TypographyProps = $props();
</script>

<h2 class={cn(className, 'scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight transition-colors first:mt-0')}>
	{@render children?.()}
</h2>
