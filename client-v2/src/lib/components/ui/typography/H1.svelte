<script lang="ts">
	import { cn } from '$lib/utils/shadcn.ts';
	import type { TypographyProps } from '$lib/components/ui/typography/typography.ts';

	let { class: className, children }: TypographyProps = $props();
</script>

<h1 class={cn(className, 'scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl')}>
	{@render children?.()}
</h1>
