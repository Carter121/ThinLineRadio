import { createContext } from 'svelte';
import type { TlrClient } from './tlr-client.ts';
import type { AudioCoordinator } from '$lib/features/AudioCoordinator.svelte.ts';
import type { TlrAlertFeed } from './tlr-alert-feed.svelte.ts';

export const [getTlrClient, setTlrClient] = createContext<TlrClient>();
export const [getAudioCoordinator, setAudioCoordinator] = createContext<AudioCoordinator>();
export const [getTlrAlertFeed, setTlrAlertFeed] = createContext<TlrAlertFeed>();
