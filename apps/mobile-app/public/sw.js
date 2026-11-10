const BASE = new URL("./", self.location.href);
const CACHE = `cafm-mobile-v6:${BASE.pathname}`;
const CORE = ["./", "index.html", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png"].map((item) => new URL(item, BASE).href);
const INDEX = new URL("index.html", BASE).href;

async function precache() {
  const cache = await caches.open(CACHE);
  const response = await fetch(new URL("offline-assets.json", BASE), { cache: "no-store" });
  if (!response.ok) throw new Error("Offline asset manifest unavailable");
  const assets = await response.json();
  if (!Array.isArray(assets) || !assets.every((url) => typeof url === "string" && !url.startsWith("/") && !url.includes("..") && new URL(url, BASE).origin === BASE.origin && new URL(url, BASE).pathname.startsWith(BASE.pathname))) throw new Error("Invalid offline asset manifest");
  await cache.addAll([...CORE, ...assets.map((item) => new URL(item, BASE).href)]);
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache());
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name !== CACHE && name.startsWith("cafm-mobile")).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || !url.pathname.startsWith(BASE.pathname) || url.pathname === "/api" || url.pathname.startsWith("/api/") || url.pathname.startsWith(`${BASE.pathname}api/`)) return;
  if (request.mode !== "navigate" && !["script", "style", "font", "image"].includes(request.destination)) return;
  if (request.mode === "navigate") event.waitUntil(precache().catch((error) => console.error("Could not update offline shell", error)));
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request);
      if (response.status >= 500) {
        const cached = await cache.match(request.mode === "navigate" ? INDEX : request);
        if (cached) return cached;
      }
      if (response.ok && response.type === "basic") {
        await cache.put(request.mode === "navigate" ? INDEX : request, response.clone());
      }
      return response;
    } catch (error) {
      const cached = await cache.match(request.mode === "navigate" ? INDEX : request);
      if (cached) return cached;
      throw error;
    }
  })());
});
