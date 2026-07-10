// Service worker for the TLR PWA.
// - Cache-first for SvelteKit's hashed immutable assets (safe: filenames change on deploy)
// - Network-first with cache fallback for everything else same-origin
// - Web push notifications

const CACHE_NAME = 'tlr-v2';

self.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(['/pwa/'])));
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
	);
	self.clients.claim();
});

async function cacheFirst(request) {
	const cached = await caches.match(request);
	if (cached) return cached;
	const response = await fetch(request);
	if (response.ok) {
		const cache = await caches.open(CACHE_NAME);
		cache.put(request, response.clone());
	}
	return response;
}

async function networkFirst(request) {
	try {
		const response = await fetch(request);
		if (response.ok) {
			const cache = await caches.open(CACHE_NAME);
			cache.put(request, response.clone());
		}
		return response;
	} catch {
		const cached = await caches.match(request);
		return cached ?? Response.error();
	}
}

self.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);
	// Only intercept same-origin GETs — let cross-origin API calls pass through untouched
	if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

	if (url.pathname.startsWith('/_app/immutable/')) {
		event.respondWith(cacheFirst(event.request));
	} else {
		event.respondWith(networkFirst(event.request));
	}
});

self.addEventListener('push', (event) => {
	const { title, body } = event.data?.json() ?? {};
	event.waitUntil(
		self.registration.showNotification(title ?? 'TLR Alert', {
			body: body ?? '',
			icon: '/empty.png',
			badge: '/badge-96x96.png'
			// TODO: Add a way to listen to audio via action
			// actions: [
			//     {
			//         action: 'test',
			//         type: 'button',
			//         title: 'Test',
			//     }
			// ]
		})
	);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	event.waitUntil(
		clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
			for (const client of clientList) {
				if (client.url.includes('/pwa') && 'focus' in client) {
					return client.focus();
				}
			}
			return clients.openWindow(event.notification.data?.url ?? '/pwa/alerts');
		})
	);
});
