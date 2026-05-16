const CACHE_NAME = "buspay-v2";
const STATIC_ASSETS = [
  "/",
  "/app",
<<<<<<< HEAD
  "/manifest.json",
=======
  "/scanner",
  "/scanner/login",
  "/manifest.json",
  "/scanner-manifest.json",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
>>>>>>> f3045cc7c7e8e6af6ca071bd0b69d040f35df90e
  "/scanner-icons/icon-192x192.png",
  "/scanner-icons/icon-512x512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(STATIC_ASSETS).catch(() => undefined),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === "navigate") {
            return caches.match("/").then((fallback) => fallback || new Response("", { status: 503, statusText: "Offline" }));
          }
          return new Response("", { status: 503, statusText: "Offline" });
        }),
      ),
  );
});
