//* Build-time configuration with runtime fallbacks.
//* Values come from optional PUBLIC_-prefixed env vars (see .env.example); when unset,
//* the UI assumes it is served by the TLR server itself (same-origin API/websocket).

//* Origin of the TLR backend. Empty string means same-origin (the Go server serves this UI).
const RAW_TLR_URL: string = import.meta.env.PUBLIC_TLR_URL ?? '';

export function tlrOrigin(): string {
	if (RAW_TLR_URL) return RAW_TLR_URL.replace(/\/$/, '');
	return window.location.origin;
}

//* MQTT websocket settings for the MQTT dashboard tab (trunk-recorder-mqtt).
export const PUBLIC_MQTT_SERVER: string = import.meta.env.PUBLIC_MQTT_SERVER ?? '';
export const PUBLIC_MQTT_WS_PORT: string = import.meta.env.PUBLIC_MQTT_WS_PORT ?? '';
export const PUBLIC_MQTT_SECURE: string = import.meta.env.PUBLIC_MQTT_SECURE ?? 'false';
export const PUBLIC_MQTT_USERNAME: string = import.meta.env.PUBLIC_MQTT_USERNAME ?? '';
export const PUBLIC_MQTT_PASSWORD: string = import.meta.env.PUBLIC_MQTT_PASSWORD ?? '';
export const PUBLIC_TOPIC: string = import.meta.env.PUBLIC_TOPIC ?? 'tr/feeds';
export const PUBLIC_UNIT_TOPIC: string = import.meta.env.PUBLIC_UNIT_TOPIC ?? 'tr/units';
