// B6: usage analytics (PLAN.md B6, Darren, 9 Aug 2026). GA4 is primary — daily
// usage, per-game opens/completions+tier, share-card clicks, no PII in any
// event, gated behind the one-time consent banner (main.js). Cloudflare Web
// Analytics is an ungated cookieless secondary/backup — no consent needed,
// injects unconditionally at boot, PRODUCTION ONLY (see isProductionHost()
// below — Cloudflare's collection endpoint rejects any other hostname with a
// real CORS error, and firing either tracker off a dev/test/LAN/tunnel
// origin is bad practice regardless). Both are client-side beacon script
// tags injected here, no server code, no new npm dependency (PLAN.md A1).
//
// Both IDs below are real (set up 9 Aug 2026) — GA_MEASUREMENT_ID is the
// daybatch.app web stream's Measurement ID; CF_BEACON_TOKEN is from
// Cloudflare Web Analytics' "Enable with JS Snippet installation" mode
// (automatic edge-injection was skipped since .app isn't Cloudflare-proxied,
// so Cloudflare's edge never sees its responses to inject into). Also turn
// off "Google Signals" / ads personalization in the GA4 property itself (a
// dashboard setting, not code) — the main source of legal exposure, per the
// B6 decision.
import { getAnalyticsConsent, setAnalyticsConsent } from "./storage.js";

const GA_MEASUREMENT_ID = "G-8SB046CWRZ";
const CF_BEACON_TOKEN = "8007c60727ec4ebe80d921384b3b9da1";

// Cloudflare's collection endpoint only accepts the hostname(s) configured
// against the token (daybatch.app) — anywhere else (localhost test/dev
// servers, a LAN IP, a tunnel URL) gets a CORS rejection that shows up as a
// real console error. GA4 doesn't enforce this, but firing either tracker
// from non-production is bad practice regardless — it pollutes real numbers
// with dev/test noise. Both injectors are gated on this, single source of
// truth for "are we actually live."
const PRODUCTION_HOSTNAMES = ["daybatch.app"];
function isProductionHost() {
  return typeof location !== "undefined" && PRODUCTION_HOSTNAMES.includes(location.hostname);
}

let gaLoaded = false;

function injectCF() {
  if (!CF_BEACON_TOKEN || CF_BEACON_TOKEN.startsWith("REPLACE_")) return;
  if (typeof document === "undefined" || !isProductionHost()) return; // no DOM, or not the real deploy — nothing to inject into
  const s = document.createElement("script");
  s.type = "module"; // matches Cloudflare's real current snippet exactly (not a plain deferred script)
  s.src = "https://static.cloudflareinsights.com/beacon.min.js";
  s.setAttribute("data-cf-beacon", JSON.stringify({ token: CF_BEACON_TOKEN }));
  document.head.appendChild(s);
}

function injectGA() {
  if (gaLoaded || !GA_MEASUREMENT_ID || GA_MEASUREMENT_ID.includes("XXXX")) return;
  if (typeof document === "undefined" || !isProductionHost()) return; // no DOM, or not the real deploy — nothing to inject into
  gaLoaded = true;
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_MEASUREMENT_ID;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  // allow_google_signals:false = no ads-data sharing, matches the property's
  // own Google Signals toggle (belt-and-suspenders, dashboard is authoritative).
  // GA4 anonymizes IPs by default; anonymize_ip is set explicitly anyway.
  window.gtag("config", GA_MEASUREMENT_ID, { allow_google_signals: false, anonymize_ip: true });
}

// Call once at boot. GA loads immediately if consent was already given in an
// earlier session (otherwise stays unloaded until acceptConsent() fires); the
// Cloudflare beacon always injects — cookieless, no consent needed (B6).
export function initAnalytics() {
  injectCF();
  if (getAnalyticsConsent() === true) injectGA();
}

// null = never decided (banner should show); true/false = decided already.
export function hasConsentDecision() { return getAnalyticsConsent() !== null; }
export function getConsent() { return getAnalyticsConsent(); }

export function acceptConsent() {
  setAnalyticsConsent(true);
  injectGA();
}
export function declineConsent() {
  setAnalyticsConsent(false);
  // no unload needed — injectGA() only ever runs after an accept.
}

// Settings-overlay toggle: lets someone who declined turn it on later, or
// someone who accepted turn it off (a future reload simply won't reinject).
export function setConsent(on) {
  if (on) acceptConsent(); else declineConsent();
}

// No-ops safely whenever GA isn't loaded (declined/undecided/no ID yet) — call
// sites stay simple, no need to check consent state at every call site.
export function trackEvent(name, params = {}) {
  if (!gaLoaded || typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", name, params);
}
