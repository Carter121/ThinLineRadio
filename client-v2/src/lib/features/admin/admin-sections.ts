//* Registry of admin panel sections rendered in the sidebar, organized into
//* labeled groups. Add a section by adding an entry here and a component to
//* sections/. Options panels are registered one page per panel so each topic
//* gets a full-width desktop page instead of one long accordion.

import type { Component } from 'svelte';
import AudioLines from '@lucide/svelte/icons/audio-lines';
import BellRing from '@lucide/svelte/icons/bell-ring';
import Captions from '@lucide/svelte/icons/captions';
import Database from '@lucide/svelte/icons/database';
import FileText from '@lucide/svelte/icons/file-text';
import FolderSearch from '@lucide/svelte/icons/folder-search';
import HeartPulse from '@lucide/svelte/icons/heart-pulse';
import KeySquare from '@lucide/svelte/icons/key-square';
import Layers from '@lucide/svelte/icons/layers';
import ListTree from '@lucide/svelte/icons/list-tree';
import LockKeyhole from '@lucide/svelte/icons/lock-keyhole';
import Mail from '@lucide/svelte/icons/mail';
import Palette from '@lucide/svelte/icons/palette';
import Plug from '@lucide/svelte/icons/plug';
import RadioTower from '@lucide/svelte/icons/radio-tower';
import Send from '@lucide/svelte/icons/send';
import Settings2 from '@lucide/svelte/icons/settings-2';
import ScrollText from '@lucide/svelte/icons/scroll-text';
import SpellCheck from '@lucide/svelte/icons/spell-check';
import Tags from '@lucide/svelte/icons/tags';
import Trash2 from '@lucide/svelte/icons/trash-2';
import UserPlus from '@lucide/svelte/icons/user-plus';
import Users from '@lucide/svelte/icons/users';
import UsersRound from '@lucide/svelte/icons/users-round';
import type { AdminSessionState } from '$lib/core/admin-session.svelte.ts';
import AdminPasswordSection from './sections/AdminPasswordSection.svelte';
import ApiKeysSection from './sections/ApiKeysSection.svelte';
import DirwatchSection from './sections/DirwatchSection.svelte';
import DownstreamsSection from './sections/DownstreamsSection.svelte';
import ImportExportSection from './sections/ImportExportSection.svelte';
import KeywordListsSection from './sections/KeywordListsSection.svelte';
import LogsSection from './sections/LogsSection.svelte';
import OptionsSection from './sections/OptionsSection.svelte';
import PurgeSection from './sections/PurgeSection.svelte';
import SystemHealthSection from './sections/SystemHealthSection.svelte';
import SystemOverridesSection from './sections/SystemOverridesSection.svelte';
import SystemsSection from './sections/SystemsSection.svelte';
import TagsSection from './sections/TagsSection.svelte';
import TalkgroupGroupsSection from './sections/TalkgroupGroupsSection.svelte';
import TranscriptParserSection from './sections/TranscriptParserSection.svelte';
import UserGroupsSection from './sections/UserGroupsSection.svelte';
import UsersSection from './sections/UsersSection.svelte';

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
			{ id: 'systems', label: 'Systems', icon: RadioTower, component: SystemsSection },
			{ id: 'system-overrides', label: 'System Overrides', icon: Layers, component: SystemOverridesSection },
			{ id: 'talkgroup-groups', label: 'Talkgroup Groups', icon: ListTree, component: TalkgroupGroupsSection },
			{ id: 'tags', label: 'Tags', icon: Tags, component: TagsSection },
			{ id: 'keyword-lists', label: 'Keyword Lists', icon: SpellCheck, component: KeywordListsSection },
			{ id: 'transcript-parser', label: 'Transcript Parser', icon: FileText, component: TranscriptParserSection }
		]
	},
	{
		id: 'access',
		label: 'Users & Access',
		sections: [
			{ id: 'users', label: 'Users', icon: Users, component: UsersSection },
			{ id: 'user-groups', label: 'User Groups', icon: UsersRound, component: UserGroupsSection },
			{ id: 'apikeys', label: 'API Keys', icon: KeySquare, component: ApiKeysSection }
		]
	},
	{
		id: 'ingest',
		label: 'Ingest & Feeds',
		sections: [
			{ id: 'dirwatch', label: 'Dirwatch', icon: FolderSearch, component: DirwatchSection },
			{ id: 'downstreams', label: 'Downstreams', icon: Send, component: DownstreamsSection }
		]
	},
	{
		id: 'monitoring',
		label: 'Monitoring',
		sections: [
			{ id: 'system-health', label: 'System Health', icon: HeartPulse, component: SystemHealthSection },
			{ id: 'logs', label: 'Logs', icon: ScrollText, component: LogsSection }
		]
	},
	{
		id: 'tools',
		label: 'Tools',
		sections: [
			{ id: 'import-export', label: 'Import & Export', icon: Database, component: ImportExportSection },
			{ id: 'purge', label: 'Purge Data', icon: Trash2, component: PurgeSection },
			{ id: 'admin-password', label: 'Admin Password', icon: LockKeyhole, component: AdminPasswordSection }
		]
	}
];

export const AdminSections: AdminSection[] = AdminSectionGroups.flatMap((group) => group.sections);

export const DefaultAdminSection = 'general';
