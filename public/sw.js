// Minimaler Service Worker fuer PWA-Installierbarkeit.
// Cached bewusst nichts, damit sensible Daten nicht offline persistiert werden;
// fungiert lediglich als Pass-through und macht die App fuer den Browser
// als installierbare Web-App erkennbar.
self.addEventListener("install", (event) => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", () => {
  // Pass-through: kein Caching.
});
