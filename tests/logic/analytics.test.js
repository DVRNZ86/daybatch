// analytics.js: consent state round-trips through storage (B6). GA/Cloudflare
// injection itself needs a DOM and is covered in e2e (settings-onboarding.spec.js,
// consent-banner behaviour); these are the pure/Node-safe parts — injectGA()/
// injectCF() explicitly guard on `typeof document === "undefined"` (and
// trackEvent() on `typeof window === "undefined"`) so this module stays safely
// importable and callable in a plain Node test even with a real Measurement
// ID/token configured (no jsdom needed).
import test from "node:test";
import assert from "node:assert/strict";

function installShim(initial = {}) {
  const map = new Map(Object.entries(initial));
  globalThis.localStorage = {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k)
  };
  return globalThis.localStorage;
}

const S = await import("../../src/core/storage.js");
const A = await import("../../src/core/analytics.js");

function fresh() {
  installShim();
  S._resetCache();
}

test("analytics consent: undecided by default, round-trips true/false", () => {
  fresh();
  assert.equal(A.getConsent(), null);
  assert.equal(A.hasConsentDecision(), false);

  A.acceptConsent();
  assert.equal(A.getConsent(), true);
  assert.equal(A.hasConsentDecision(), true);

  A.declineConsent();
  assert.equal(A.getConsent(), false);
  assert.equal(A.hasConsentDecision(), true); // declined still counts as "decided"
});

test("setConsent(true/false) is equivalent to accept/decline", () => {
  fresh();
  A.setConsent(true);
  assert.equal(A.getConsent(), true);
  A.setConsent(false);
  assert.equal(A.getConsent(), false);
});

test("initAnalytics/acceptConsent/declineConsent never throw without a DOM (explicit typeof document guard)", () => {
  fresh();
  assert.doesNotThrow(() => A.initAnalytics());
  assert.doesNotThrow(() => A.acceptConsent());
  assert.doesNotThrow(() => A.declineConsent());
});

test("trackEvent never throws when GA hasn't loaded (no gtag/window in this environment)", () => {
  fresh();
  assert.doesNotThrow(() => A.trackEvent("game_open", { game: "lexi" }));
  assert.doesNotThrow(() => A.trackEvent("game_complete", { game: "lexi", tier: 1 }));
  assert.doesNotThrow(() => A.trackEvent("share_click", { surface: "game", game: "lexi" }));
});
