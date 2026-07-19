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

const { redeemCode, claimSession, maybeReverify, VERIFY_ENDPOINT, CLAIM_ENDPOINT, PAYMENT_LINKS, REVERIFY_MARGIN_MS } = await import("../../src/core/entitlement.js");
const { _resetCache, getEntitlement, setEntitlement, isPremium, getDeviceId } = await import("../../src/core/storage.js");

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

test("endpoints point at the deployed Worker; a null endpoint still fails fast", async () => {
  assert.equal(VERIFY_ENDPOINT, "https://daybatch-entitlement.daybatch.workers.dev/redeem");
  assert.equal(CLAIM_ENDPOINT, "https://daybatch-entitlement.daybatch.workers.dev/claim");
  assert.deepEqual(Object.keys(PAYMENT_LINKS), ["monthly", "yearly", "lifetime"]);
  fresh();
  const r = await redeemCode("ABC123", () => { throw new Error("should not be called"); }, null);
  assert.equal(r.ok, false);
  assert.match(r.error, /live yet/i);
  assert.equal(getEntitlement(), null);
});

test("redeem sends the stable device id with the code", async () => {
  fresh();
  let sentBody = null;
  await redeemCode("ABC123", async (url, opts) => {
    sentBody = JSON.parse(opts.body);
    return { ok: true, status: 200, json: async () => ({ tier: "lifetime", expiresAt: null }) };
  }, FAKE);
  assert.equal(sentBody.code, "ABC123");
  assert.equal(sentBody.device, getDeviceId(), "device id matches the stored one");
  assert.ok(sentBody.device.length >= 8, "device id is non-trivial");
});

test("claimSession exchanges a checkout session for a code and redeems it in one step", async () => {
  fresh();
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push(url);
    if (url.endsWith("/claim")) {
      assert.equal(JSON.parse(opts.body).session_id, "cs_test_123");
      return { ok: true, status: 200, json: async () => ({ code: "pi_abc.1234567890", tier: "lifetime" }) };
    }
    return { ok: true, status: 200, json: async () => ({ tier: "lifetime", expiresAt: null }) };
  };
  const r = await claimSession("cs_test_123", fetchImpl);
  assert.deepEqual(r, { ok: true, tier: "lifetime", code: "pi_abc.1234567890" });
  assert.equal(calls.length, 2, "claim then redeem");
  assert.equal(isPremium(), true);
});

test("claimSession surfaces an incomplete payment clearly and stores nothing", async () => {
  fresh();
  const r = await claimSession("cs_test_bad", fakeFetch(402, { error: "payment not complete" }));
  assert.equal(r.ok, false);
  assert.match(r.error, /not completed/i);
  assert.equal(getEntitlement(), null);
});

test("maybeReverify: does nothing for free, lifetime, or a comfortably-fresh subscription", async () => {
  fresh();
  const explode = () => { throw new Error("should not fetch"); };
  assert.equal(await maybeReverify(explode), false, "free tier");

  setEntitlement({ code: "pi_x.abc", tier: "lifetime", verifiedAt: Date.now(), expiresAt: null });
  assert.equal(await maybeReverify(explode), false, "lifetime never re-verifies");

  setEntitlement({ code: "sub_x.abc", tier: "monthly", verifiedAt: Date.now(), expiresAt: Date.now() + REVERIFY_MARGIN_MS + 60000 });
  assert.equal(await maybeReverify(explode), false, "outside the margin: no call");
});

test("maybeReverify: refreshes an aging subscription, revokes on a definitive server no, survives network trouble", async () => {
  fresh();
  const aging = () => ({ code: "sub_x.abc", tier: "monthly", verifiedAt: 0, expiresAt: Date.now() + 60000 });

  setEntitlement(aging());
  assert.equal(await maybeReverify(fakeFetch(200, { tier: "monthly", expiresAt: Date.now() + 14 * 86400000 })), true);
  assert.equal(isPremium(), true, "refreshed");
  assert.ok(getEntitlement().expiresAt > Date.now() + 13 * 86400000, "new grace window stored");

  setEntitlement(aging());
  assert.equal(await maybeReverify(fakeFetch(404, { error: "subscription not active" })), true);
  assert.equal(getEntitlement(), null, "cancelled sub revoked");

  setEntitlement(aging());
  assert.equal(await maybeReverify(async () => { throw new TypeError("offline"); }), false);
  assert.equal(isPremium(), true, "network failure leaves the grace period running");
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
