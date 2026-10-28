// Syvyys service worker: keeps the app itself offline and remembers map tiles you've already viewed.
const APP = "syvyys-app-v5";
const TILES = "syvyys-tiles-v1";
const MAX_TILES = 1500; // roughly 20–40 MB at most

const SHELL = [
  "./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(APP).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k !== APP && k !== TILES).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});

const isTile = url =>
  /tile\.openstreetmap\.org|tile\.opentopomap\.org|avoin-karttakuva\.maanmittauslaitos\.fi/.test(url) ||
  (/REQUEST=GetMap/i.test(url) && /ymparisto\.fi|traficom\.fi/.test(url));

async function trim() {
  const c = await caches.open(TILES);
  const keys = await c.keys();
  if (keys.length > MAX_TILES) {
    for (const k of keys.slice(0, keys.length - MAX_TILES)) await c.delete(k);
  }
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = req.url;

  if (isTile(url)) {
    // network first so depths stay current; fall back to the saved copy when offline
    e.respondWith((async () => {
      const c = await caches.open(TILES);
      try {
        const res = await fetch(req);
        if (res.ok) { c.put(req, res.clone()); trim(); }
        return res;
      } catch (err) {
        const hit = await c.match(req);
        if (hit) return hit;
        throw err;
      }
    })());
    return;
  }

  if (SHELL.some(s => url.endsWith(s.replace("./", "/")) || url === s) || req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(APP)).put(req, res.clone());
        return res;
      } catch (err) {
        return (await caches.match(req)) || (await caches.match("./index.html"));
      }
    })());
  }
});
