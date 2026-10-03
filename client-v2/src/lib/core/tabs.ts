import type { Component } from 'svelte';
import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
import Radio from '@lucide/svelte/icons/radio';
import MapPinIcon from '@lucide/svelte/icons/map-pin';
import ClipboardList from '@lucide/svelte/icons/clipboard-list';
import FileText from '@lucide/svelte/icons/file-text';
import Antenna from '@lucide/svelte/icons/antenna';
import Truck from '@lucide/svelte/icons/truck';
import Bug from '@lucide/svelte/icons/bug';
import Settings from '@lucide/svelte/icons/settings';

export const TabId = {
	dashboard: 'dashboard',
	calls: 'calls',
	alertLog: 'alert-log',
	transcripts: 'transcripts',
	map: 'map',
	apparatus: 'apparatus',
	mqtt: 'mqtt',
	settings: 'settings',
	debug: 'debug'
} as const;

export type TabId = (typeof TabId)[keyof typeof TabId];

export interface TlrTab {
	id: TabId;
	label: string;
	icon: Component;
}

export const Tabs = [
	{ id: TabId.dashboard, label: 'Dashboard', icon: LayoutDashboard },
	{ id: TabId.calls, label: 'Calls', icon: Radio },
	{ id: TabId.alertLog, label: 'Alert Log', icon: ClipboardList },
	{ id: TabId.transcripts, label: 'Transcripts', icon: FileText },
	{ id: TabId.map, label: 'Map', icon: MapPinIcon },
	{ id: TabId.apparatus, label: 'Apparatus', icon: Truck },
	{ id: TabId.mqtt, label: 'MQTT', icon: Antenna },
	{ id: TabId.settings, label: 'Settings', icon: Settings }
] satisfies TlrTab[];

export const DebugTab = {
	id: TabId.debug,
	label: 'Debug',
	icon: Bug
} satisfies TlrTab;

export const AllTabs = [...Tabs, DebugTab] satisfies TlrTab[];

export const DefaultTab = TabId.dashboard;
