// Daybatch service worker (B4): cache-first app shell, versioned cache.
// Classic script (not a module) for iOS compatibility.
//
// VERSION must match the footer version in index.html — a logic test enforces
// this. EVERY deploy (patches included) must bump both, or installed clients
// keep serving the previous shell from cache.
const VERSION = "v0.D1.1";
const CACHE = "daybatch-" + VERSION;

const SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/src/styles.css",
  "/src/main.js",
  "/src/core/rng.js",
  "/src/core/share.js",
  "/src/core/storage.js",
  "/src/core/streaks.js",
  "/src/core/ui.js",
  "/src/core/entitlement.js",
  "/src/core/timer.js",
  "/src/games/codebreak.js",
  "/src/games/crossing.js",
  "/src/games/lexi.js",
  "/src/games/sonar.js",
  "/src/games/tally.js",
  "/src/games/words.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/favicon-48.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.indexOf("daybatch-") === 0 && k !== CACHE)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  // Never intercept the v13 reference or the test harness.
  if (url.pathname.indexOf("/reference/") === 0 || url.pathname.indexOf("/tests/") === 0) return;
  e.respondWith(
    caches.open(CACHE).then((c) =>
      c.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request))
    )
  );
});
