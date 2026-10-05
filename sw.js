// Offline support. App files: network first (4 s timeout) with cache fallback, so updates arrive
// but a weak basement signal still opens the app. Pinned CDN libraries: cache first.
// Map tiles, glyphs and sprites: cache first, keyed without OpenFreeMap's dated planet version.
const SHELL = "shell-v1";
const CDN = "cdn-v1";
const MAP = "map-v1";
const FONTS = "fonts-v1";
const KEEP = [SHELL, CDN, MAP, FONTS];

const SHELL_FILES = [
  "/", "/app.js", "/hours.js", "/i18n.js", "/select.js", "/styles.css", "/data/shops.json",
  "/manifest.webmanifest", "/icons/icon-192.png", "/icons/apple-touch-icon.png",
];
const CDN_FILES = [
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
  "https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js",
  "https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css",
  "https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js",
  "https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.1.4/leaflet-maplibre-gl.js",
];

self.addEventListener("install", e => {
  e.waitUntil(Promise.all([
    caches.open(SHELL).then(c => c.addAll(SHELL_FILES)),
    caches.open(CDN).then(c => c.addAll(CDN_FILES.map(u => new Request(u, { mode: "cors" })))),
  ]).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => !KEEP.includes(k)).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const tileKey = url => url.replace(/\/planet\/[^/]+\/(\d+\/\d+\/\d+\.pbf)$/, "/planet/$1");

async function networkFirst(req, cacheName, key = req, fallback) {
  const cache = await caches.open(cacheName);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 4000)),
    ]);
    if (res.ok) cache.put(key, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(key, { ignoreSearch: true }) || (fallback && await cache.match(fallback));
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req, cacheName, key = req) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(key, res.clone());
  return res;
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const fresh = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
  return hit || fresh;
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    if (req.mode === "navigate") return e.respondWith(networkFirst(req, SHELL, "/", "/"));
    return e.respondWith(networkFirst(req, SHELL, url.pathname));
  }
  if (url.host === "unpkg.com") return e.respondWith(cacheFirst(req, CDN));
  if (url.host === "fonts.googleapis.com" || url.host === "fonts.gstatic.com") return e.respondWith(staleWhileRevalidate(req, FONTS));
  if (url.host === "tiles.openfreemap.org") {
    if (url.pathname.endsWith(".pbf") && url.pathname.startsWith("/planet/")) return e.respondWith(cacheFirst(req, MAP, tileKey(req.url)));
    if (url.pathname.startsWith("/styles/") || url.pathname === "/planet") return e.respondWith(networkFirst(req, MAP));
    return e.respondWith(cacheFirst(req, MAP)); // glyphs, sprites, natural earth
  }
});
