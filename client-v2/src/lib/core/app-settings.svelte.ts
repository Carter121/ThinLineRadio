import { PersistedState } from 'runed';

//* Central registry of simple user settings.
//* Declare a setting once in appSettings below and:
//* 1. Consumers read/write it anywhere via appSettings.<name>.current (fully typed).
//* 2. The Settings tab renders it automatically, grouped into a card per section.
//* Complex settings UIs (like the per-talkgroup Alert Preferences) stay as custom
//* cards in SettingsTab; this registry is for simple scalar knobs only.

type SettingCommon = {
	//* Settings tab card this setting renders under.
	section: string;
	label: string;
	description: string;
	//* localStorage key. Renaming one silently drops the user's stored value.
	key: string;
};

export class SelectSetting<V extends string> {
	readonly kind = 'select';
	readonly section: string;
	readonly label: string;
	readonly description: string;
	readonly key: string;
	readonly options: readonly { value: V; label: string }[];
	private readonly fallback: V;
	private readonly state: PersistedState<V>;

	constructor(def: SettingCommon & { options: readonly { value: V; label: string }[]; default: V }) {
		this.section = def.section;
		this.label = def.label;
		this.description = def.description;
		this.key = def.key;
		this.options = def.options;
		this.fallback = def.default;
		this.state = new PersistedState<V>(def.key, def.default);
	}

	//* Falls back to the default if the stored value is corrupted or no longer a valid option.
	get current(): V {
		const value = this.state.current;
		return this.options.some((o) => o.value === value) ? value : this.fallback;
	}
	set current(value: V) {
		this.state.current = value;
	}

	get currentLabel(): string {
		return this.options.find((o) => o.value === this.current)?.label ?? '';
	}

	//* For UI callbacks that hand back an arbitrary string; unknown values are ignored.
	setFromString(value: string) {
		const match = this.options.find((o) => o.value === value);
		if (match) this.state.current = match.value;
	}
}

export class ToggleSetting {
	readonly kind = 'toggle';
	readonly section: string;
	readonly label: string;
	readonly description: string;
	readonly key: string;
	private readonly state: PersistedState<boolean>;

	constructor(def: SettingCommon & { default: boolean }) {
		this.section = def.section;
		this.label = def.label;
		this.description = def.description;
		this.key = def.key;
		this.state = new PersistedState<boolean>(def.key, def.default);
	}

	//* Coerces corrupted stored values to a real boolean.
	get current(): boolean {
		return this.state.current === true;
	}
	set current(value: boolean) {
		this.state.current = value;
	}
}

//* Helpers so option value unions are inferred as literal types at the declaration site.
function selectSetting<const V extends string>(
	def: SettingCommon & { options: readonly { value: V; label: string }[]; default: NoInfer<V> }
): SelectSetting<V> {
	return new SelectSetting(def);
}

function toggleSetting(def: SettingCommon & { default: boolean }): ToggleSetting {
	return new ToggleSetting(def);
}

//* Referenced so eslint/ts do not flag it before the first toggle setting exists.
void toggleSetting;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySetting = SelectSetting<any> | ToggleSetting;

//* The registry. Add new settings here.
export const appSettings = {
	notificationFilter: selectSetting({
		section: 'Alert Feed',
		label: 'Notification Filter',
		description: 'Choose whether to receive notifications for all alerts or only those with a battalion unit.',
		key: 'tlr-notification-filter',
		options: [
			{ value: 'all', label: 'All Alerts' },
			{ value: 'battalion-only', label: 'Battalion Only' }
		],
		default: 'all'
	}),
	timeFormat: selectSetting({
		section: 'Alert Feed',
		label: 'Time Display',
		description: 'Show alert times as relative, an absolute clock time, or both.',
		key: 'tlr-alert-time-format-desktop',
		options: [
			{ value: 'relative', label: 'Relative (e.g. 5m ago)' },
			{ value: 'absolute', label: 'Absolute (clock time)' },
			{ value: 'both', label: 'Both' }
		],
		default: 'relative'
	})
};

//* Sections in declaration order, for the Settings tab renderer.
export function settingsSections(): { section: string; settings: AnySetting[] }[] {
	const sections: { section: string; settings: AnySetting[] }[] = [];
	for (const setting of Object.values(appSettings) as AnySetting[]) {
		let group = sections.find((s) => s.section === setting.section);
		if (!group) {
			group = { section: setting.section, settings: [] };
			sections.push(group);
		}
		group.settings.push(setting);
	}
	return sections;
}
