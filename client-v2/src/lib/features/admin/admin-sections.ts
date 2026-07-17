//* Registry of admin panel sections (sidebar navigation). Add a section by
//* adding an entry here and a component to sections/.

import type { Component } from 'svelte';
import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
import OptionsSection from './sections/OptionsSection.svelte';

export interface AdminSection {
	id: string;
	label: string;
	icon: Component;
	component: Component<{ session: import('$lib/core/admin-session.svelte.ts').AdminSessionState }>;
}

export const AdminSections: AdminSection[] = [{ id: 'options', label: 'Options', icon: SlidersHorizontal, component: OptionsSection }];

export const DefaultAdminSection = 'options';
