// entitlement.js: redeem-code client. fetch and the endpoint are both
// injected so no real network call ever happens in tests, and every branch
// is reachable even before the Cloudflare Worker (A9) is deployed.
import test from "node:test";
import assert from "node:assert/strict";

function installShim() {
  const map = new Map();
  globalThis.localStorage = {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k)
  };
}

const { redeemCode, VERIFY_ENDPOINT } = await import("../../src/core/entitlement.js");
const { _resetCache, getEntitlement, isPremium } = await import("../../src/core/storage.js");

function fresh() { installShim(); _resetCache(); }

const FAKE = "https://verify.example/redeem"; // stand-in for the future Worker URL
const fakeFetch = (status, body) => async () => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body
});

test("empty code is rejected before any fetch", async () => {
  fresh();
  const r = await redeemCode("   ", () => { throw new Error("should not be called"); }, FAKE);
  assert.equal(r.ok, false);
  assert.match(r.error, /enter a code/i);
});

test("VERIFY_ENDPOINT is unset until the Cloudflare Worker is deployed", async () => {
  assert.equal(VERIFY_ENDPOINT, null);
  fresh();
  const r = await redeemCode("ABC123", () => { throw new Error("should not be called"); });
  assert.equal(r.ok, false);
  assert.match(r.error, /live yet/i);
  assert.equal(getEntitlement(), null);
});

test("a successful redeem stores the entitlement and reports the tier", async () => {
  fresh();
  const r = await redeemCode(" abc123 ", fakeFetch(200, { tier: "lifetime", expiresAt: null }), FAKE);
  assert.deepEqual(r, { ok: true, tier: "lifetime" });
  assert.equal(isPremium(), true);
  assert.equal(getEntitlement().code, "abc123", "code is trimmed before storing");
});

test("404 (unrecognised code) surfaces a clear error and sets nothing", async () => {
  fresh();
  const r = await redeemCode("NOPE", fakeFetch(404, {}), FAKE);
  assert.equal(r.ok, false);
  assert.match(r.error, /not recognised/i);
  assert.equal(getEntitlement(), null);
});

test("409 (redemption cap hit) surfaces a clear error and sets nothing", async () => {
  fresh();
  const r = await redeemCode("SHARED2X", fakeFetch(409, {}), FAKE);
  assert.equal(r.ok, false);
  assert.match(r.error, /already been used/i);
  assert.equal(getEntitlement(), null);
});

test("other non-2xx statuses fall back to a generic retry message", async () => {
  fresh();
  const r = await redeemCode("X", fakeFetch(500, {}), FAKE);
  assert.equal(r.ok, false);
  assert.match(r.error, /try again/i);
});

test("a malformed success body (no tier) is treated as an error, nothing stored", async () => {
  fresh();
  const r = await redeemCode("X", fakeFetch(200, { ok: true }), FAKE);
  assert.equal(r.ok, false);
  assert.equal(getEntitlement(), null);
});

test("a network failure surfaces a friendly error and does not set entitlement", async () => {
  fresh();
  const r = await redeemCode("ABC123", async () => { throw new TypeError("network down"); }, FAKE);
  assert.equal(r.ok, false);
  assert.match(r.error, /network error/i);
  assert.equal(isPremium(), false);
});
