/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute, setCatchHandler } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

// App shell: every built asset is precached so the installed app opens offline.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// SPA navigations → cached index.html (never intercept API calls).
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }));

// Avatar images: cache for offline profile display. API JSON is NOT cached here —
// TanStack Query persists it in IndexedDB with proper per-user scoping.
registerRoute(
  ({ url, request }) => request.destination === 'image' && url.pathname === '/api/users/me/avatar',
  new CacheFirst({ cacheName: 'ef-avatars', plugins: [new ExpirationPlugin({ maxEntries: 5, maxAgeSeconds: 7 * 86400 })] }),
);

// Fallback page if a navigation fails and the shell is unavailable.
setCatchHandler(async ({ request }) => {
  if (request.destination === 'document') {
    const cached = await caches.match('/offline.html', { ignoreSearch: true });
    if (cached) return cached;
  }
  return Response.error();
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

/**
 * Background Sync (Chromium): when connectivity returns, wake open clients so the sync engine
 * flushes the outbox (it owns auth + IndexedDB logic). Browsers without Background Sync rely on
 * the app's own online/focus/interval triggers.
 */
self.addEventListener('sync', ((event: Event & { tag: string; waitUntil(p: Promise<unknown>): void }) => {
  if (event.tag !== 'ef-sync') return;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      clients.forEach((c) => c.postMessage({ type: 'SYNC_REQUESTED' }));
    }),
  );
}) as EventListener);
