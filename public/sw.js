// Service Worker - minimaler Pass-through.
// Wir cachen bewusst keine HTML/Daten, damit nichts Sensibles offline
// persistiert. Damit die App aber wirklich als installierbare PWA
// erkannt wird, brauchen Browser einen fetch-Handler - der hier reicht.

const VERSION = "v3";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Alte Caches loeschen
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== VERSION).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Nur GET, nur same-origin
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // App-Shell-Assets duerfen (privat) gecached werden - statische Dateien
  // unter /_next/static/, /icon-*, /favicon-*, /manifest.webmanifest
  const path = url.pathname;
  const isStatic =
    path.startsWith("/_next/static/") ||
    path === "/manifest.webmanifest" ||
    path === "/icon.svg" ||
    /^\/(icon|favicon|apple-touch-icon)[\w.-]*\.(png|svg)$/.test(path);
  if (!isStatic) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(VERSION);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        return hit ?? new Response("", { status: 504 });
      }
    })()
  );
});
