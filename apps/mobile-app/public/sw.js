const CACHE = "cafm-mobile-shell-v1";
const CORE = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg", "/icon-192.png", "/icon-512.png"];

async function precache() {
  const cache = await caches.open(CACHE);
  const response = await fetch("/offline-assets.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Offline asset manifest unavailable");
  const assets = await response.json();
  if (!Array.isArray(assets) || !assets.every((url) => typeof url === "string" && url.startsWith("/") && !url.startsWith("//"))) throw new Error("Invalid offline asset manifest");
  await cache.addAll([...CORE, ...assets]);
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache());
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname === "/api" || url.pathname.startsWith("/api/")) return;
  if (request.mode !== "navigate" && !["script", "style", "font", "image"].includes(request.destination)) return;
  if (request.mode === "navigate") event.waitUntil(precache().catch((error) => console.error("Could not update offline shell", error)));
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request);
      if (response.status >= 500) {
        const cached = await cache.match(request.mode === "navigate" ? "/index.html" : request);
        if (cached) return cached;
      }
      if (response.ok && response.type === "basic") {
        await cache.put(request.mode === "navigate" ? "/index.html" : request, response.clone());
      }
      return response;
    } catch (error) {
      const cached = await cache.match(request.mode === "navigate" ? "/index.html" : request);
      if (cached) return cached;
      throw error;
    }
  })());
});
