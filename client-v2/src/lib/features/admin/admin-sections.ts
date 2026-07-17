//* Registry of admin panel sections rendered in the sidebar, organized into
//* labeled groups. Add a section by adding an entry here and a component to
//* sections/. Options panels are registered one page per panel so each topic
//* gets a full-width desktop page instead of one long accordion.

import type { Component } from 'svelte';
import AudioLines from '@lucide/svelte/icons/audio-lines';
import BellRing from '@lucide/svelte/icons/bell-ring';
import Captions from '@lucide/svelte/icons/captions';
import Mail from '@lucide/svelte/icons/mail';
import Palette from '@lucide/svelte/icons/palette';
import Plug from '@lucide/svelte/icons/plug';
import RadioTower from '@lucide/svelte/icons/radio-tower';
import Settings2 from '@lucide/svelte/icons/settings-2';
import UserPlus from '@lucide/svelte/icons/user-plus';
import type { AdminSessionState } from '$lib/core/admin-session.svelte.ts';
import OptionsSection from './sections/OptionsSection.svelte';
import SystemOverridesSection from './sections/SystemOverridesSection.svelte';

//* Sections receive the shared session plus any extra props from the registry.
export type AdminSectionComponent = Component<{ session: AdminSessionState; panelId?: string }>;

export interface AdminSection {
	id: string;
	label: string;
	icon: Component;
	component: AdminSectionComponent;
	//* Extra props spread into the component (e.g. the options panel id).
	props?: Record<string, unknown>;
}

export interface AdminSectionGroup {
	id: string;
	label: string;
	sections: AdminSection[];
}

const optionsPage = (id: string, label: string, icon: Component): AdminSection => ({
	id,
	label,
	icon,
	component: OptionsSection,
	props: { panelId: id }
});

export const AdminSectionGroups: AdminSectionGroup[] = [
	{
		id: 'server',
		label: 'Server',
		sections: [
			optionsPage('general', 'General', Settings2),
			optionsPage('branding', 'Branding', Palette),
			optionsPage('alerts', 'Alerts & Health', BellRing),
			optionsPage('audio', 'Audio', AudioLines),
			optionsPage('email', 'Email', Mail),
			optionsPage('integrations', 'Integrations', Plug),
			optionsPage('transcription', 'Transcription', Captions),
			optionsPage('registration', 'Registration', UserPlus)
		]
	},
	{
		id: 'radio',
		label: 'Radio',
		sections: [
			{ id: 'system-overrides', label: 'System Overrides', icon: RadioTower, component: SystemOverridesSection }
		]
	}
];

export const AdminSections: AdminSection[] = AdminSectionGroups.flatMap((group) => group.sections);

export const DefaultAdminSection = 'general';
