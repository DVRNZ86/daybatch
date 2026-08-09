// B6: usage analytics (PLAN.md B6, Darren, 9 Aug 2026). GA4 is primary — daily
// usage, per-game opens/completions+tier, share-card clicks, no PII in any
// event, gated behind the one-time consent banner (main.js). Cloudflare Web
// Analytics is an ungated cookieless secondary/backup — no consent needed,
// injects unconditionally at boot. Both are client-side beacon script tags
// injected here, no server code, no new npm dependency (PLAN.md A1).
//
// Both need a real ID/token before they do anything — see GA_MEASUREMENT_ID
// and CF_BEACON_TOKEN below (TODOs for Darren, same pattern as D1's TEST MODE
// Stripe placeholders in src/core/entitlement.js). Also turn off "Google
// Signals" / ads personalization in the GA4 property itself (a dashboard
// setting, not code) — the main source of legal exposure, per the B6 decision.
import { getAnalyticsConsent, setAnalyticsConsent } from "./storage.js";

// TODO(Darren): replace with the real GA4 Measurement ID (Admin → Data Streams
// → your web stream → Measurement ID, looks like "G-XXXXXXXXXX") before launch.
const GA_MEASUREMENT_ID = "G-XXXXXXXXXX";

// TODO(Darren): replace with the real Cloudflare Web Analytics token (Cloudflare
// dashboard → Web Analytics → add daybatch.app as a site → copy the token) before
// launch. Ungated by design (cookieless beacon, PLAN.md B6) — unlike GA, this
// injects unconditionally, it just does nothing useful until a real token is set.
const CF_BEACON_TOKEN = "REPLACE_WITH_CF_TOKEN";

let gaLoaded = false;

function injectCF() {
  if (!CF_BEACON_TOKEN || CF_BEACON_TOKEN.startsWith("REPLACE_")) return;
  const s = document.createElement("script");
  s.defer = true;
  s.src = "https://static.cloudflareinsights.com/beacon.min.js";
  s.setAttribute("data-cf-beacon", JSON.stringify({ token: CF_BEACON_TOKEN }));
  document.head.appendChild(s);
}

function injectGA() {
  if (gaLoaded || !GA_MEASUREMENT_ID || GA_MEASUREMENT_ID.includes("XXXX")) return;
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
  if (!gaLoaded || typeof window.gtag !== "function") return;
  window.gtag("event", name, params);
}
