<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '$lib/components/ui/table';
	import RadioTower from '@lucide/svelte/icons/radio-tower';
	import type { AdminSessionState } from '$lib/core/admin-session.svelte.ts';
	import type { AdminSystem } from '$lib/core/admin-types.ts';

	interface Props {
		session: AdminSessionState;
	}

	let { session }: Props = $props();

	const systems = $derived(session.config?.systems ?? []);

	//* Each save hits its dedicated endpoint, then refreshes the config document
	//* so the table reflects what the server actually stored.
	async function save(label: string, action: () => Promise<unknown>) {
		try {
			await action();
			await session.refreshConfig();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : `Failed to save ${label}`);
		}
	}

	function noAudioEnabled(system: AdminSystem): boolean {
		return system.noAudioAlertsEnabled ?? true;
	}

	function saveNoAudio(system: AdminSystem, enabled: boolean, threshold: number) {
		void save(`no-audio settings for ${system.label}`, () => session.client.saveSystemNoAudioSettings(system.id, enabled, threshold));
	}

	function numberFrom(event: Event, fallback: number): number {
		const parsed = Number((event.currentTarget as HTMLInputElement).value);
		return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
	}
</script>

{#if systems.length > 0}
	<Card class="gap-0 py-0">
		<CardHeader class="px-4 pt-3 pb-2">
			<CardTitle class="flex items-center gap-2 text-base">
				<RadioTower class="size-4" />
				Per-System Overrides
			</CardTitle>
		</CardHeader>
		<CardContent class="space-y-2 px-4 pt-0 pb-4">
			<p class="text-xs text-muted-foreground">
				Overrides for individual systems. Changes save immediately. Retention of 0 uses the global prune setting.
			</p>
			<div class="overflow-x-auto">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>System</TableHead>
							<TableHead class="text-center">No-Audio Alerts</TableHead>
							<TableHead class="text-center">No-Audio Threshold (min)</TableHead>
							<TableHead class="text-center">Retention (days)</TableHead>
							<TableHead class="text-center">Duplicate Detection</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{#each systems as system (system.id)}
							<TableRow>
								<TableCell class="font-medium">{system.label}</TableCell>
								<TableCell class="text-center">
									<Switch
										checked={noAudioEnabled(system)}
										onCheckedChange={(checked: boolean) => saveNoAudio(system, checked, system.noAudioThresholdMinutes ?? 30)}
										aria-label={`No-audio alerts for ${system.label}`}
									/>
								</TableCell>
								<TableCell class="text-center">
									<Input
										type="number"
										min={5}
										step={5}
										class="mx-auto h-8 w-24 text-center"
										disabled={!noAudioEnabled(system)}
										value={String(system.noAudioThresholdMinutes ?? 30)}
										onchange={(e: Event) => saveNoAudio(system, noAudioEnabled(system), numberFrom(e, system.noAudioThresholdMinutes ?? 30))}
									/>
								</TableCell>
								<TableCell class="text-center">
									<Input
										type="number"
										min={0}
										class="mx-auto h-8 w-24 text-center"
										value={String(system.retentionDays ?? 0)}
										onchange={(e: Event) =>
											void save(`retention for ${system.label}`, () =>
												session.client.saveSystemRetentionSettings(system.id, numberFrom(e, system.retentionDays ?? 0))
											)}
									/>
								</TableCell>
								<TableCell class="text-center">
									<Switch
										checked={system.duplicateDetectionEnabled ?? true}
										onCheckedChange={(checked: boolean) =>
											void save(`duplicate detection for ${system.label}`, () =>
												session.client.saveSystemDuplicateDetectionSettings(system.id, checked)
											)}
										aria-label={`Duplicate detection for ${system.label}`}
									/>
								</TableCell>
							</TableRow>
						{/each}
					</TableBody>
				</Table>
			</div>
		</CardContent>
	</Card>
{/if}
