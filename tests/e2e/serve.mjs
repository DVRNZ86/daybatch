// Minimal static file server for Playwright (zero dependencies).
// Serves the repo root so tests can load both index.html and the v13 reference.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const PORT = process.env.PORT || 4173;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

// Dev-only convenience, this file only (never shipped — src/ has zero debug
// backdoors): seeds a fake lifetime-premium entitlement into localStorage
// without touching the real Stripe/Worker flow, then redirects to "/". Exists
// because the real purchase→redeem round-trip needs the tester's origin on
// the Worker's CORS allowlist, which an ad-hoc LAN IP or tunnel URL never is
// (by design — see worker/daybatch-worker.js resolveOrigin()), so testing
// premium-gated UI from a phone over LAN/tunnel would otherwise be blocked.
// Merges into whatever's already stored rather than replacing it, so it
// doesn't wipe game snapshots/history already accumulated in the session.
const SEED_PREMIUM_HTML = `<!doctype html><meta charset="utf-8"><script>
  var r; try { r = JSON.parse(localStorage.getItem("daybatch:v1")); } catch (e) {}
  if (!r || typeof r !== "object") r = { schema: 1, lastSeenDate: null, games: {}, history: [] };
  r.premium = { code: "DEV-SEED", tier: "lifetime", verifiedAt: Date.now(), expiresAt: null };
  localStorage.setItem("daybatch:v1", JSON.stringify(r));
  location.replace("/");
</script>`;

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (path === "/__seed-premium") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(SEED_PREMIUM_HTML);
      return;
    }
    if (path === "/favicon.ico") { res.writeHead(204).end(); return; }
    if (path.endsWith("/")) path += "index.html";
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(normalize(ROOT))) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    // No caching, ever: this server backs both the Playwright suite (which
    // always wants current-on-disk content, not a stale copy) and ad-hoc
    // phone testing over LAN/tunnel — a client silently serving a cached
    // response from an earlier visit is exactly the kind of confusion this
    // header exists to prevent (found via a real case: a premium-gated
    // header icon added in a later commit not appearing on a phone that had
    // cached an earlier response, even though the same-session crown badge
    // — present since an earlier commit — rendered fine).
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(PORT, () => console.log(`daybatch test server on http://localhost:${PORT}`));
