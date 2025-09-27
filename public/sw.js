// public/sw.js
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('help_hub-shell').then((cache) =>
      cache.addAll(['/', '/index.html', '/manifest.webmanifest'])
    )
  )
})
self.addEventListener('activate', () => self.clients.claim())
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(event.request).then((res) => res || fetch(event.request))
    )
    return
  }
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  )
})
