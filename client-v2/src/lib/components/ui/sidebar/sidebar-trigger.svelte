<script lang="ts">
	import { Button, type ButtonElementProps } from "$lib/components/ui/button/index.js";
	import PanelLeftIcon from '@lucide/svelte/icons/panel-left';
	import { cn } from "$lib/utils/shadcn.js";
	import { useSidebar } from "./context.svelte.js";

	//* Typed against the button-element props only (not the anchor union); the
	//* project's customized Button union is too complex for ComponentProps here.
	let {
		ref = $bindable(null),
		class: className,
		onclick,
		...restProps
	}: ButtonElementProps & {
		onclick?: (e: MouseEvent) => void;
	} = $props();

	const sidebar = useSidebar();
</script>

<Button
	bind:ref
	data-sidebar="trigger"
	data-slot="sidebar-trigger"
	variant="ghost"
	size="icon-sm"
	class={cn("cn-sidebar-trigger", className)}
	type="button"
	onclick={(e) => {
		onclick?.(e);
		sidebar.toggle();
	}}
	{...restProps}
>
	<PanelLeftIcon  />
	<span class="sr-only">Toggle Sidebar</span>
</Button>
