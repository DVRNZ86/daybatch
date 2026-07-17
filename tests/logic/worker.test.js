// D1: Cloudflare Worker (worker/daybatch-worker.js) — pure crypto/parsing
// logic only. The fetch() handler itself needs Cloudflare's runtime + a
// real Stripe account, neither of which exist in this repo; those endpoints
// are exercised manually once Darren deploys (see worker/README.md).
import test from "node:test";
import assert from "node:assert/strict";
import { hmacHex, timingSafeEqual, makeCode, verifyCode, tierForStripeId, REDEMPTION_CAP, OFFLINE_GRACE_MS } from "../../worker/daybatch-worker.js";

test("hmacHex is deterministic and depends on both secret and message", async () => {
  const a = await hmacHex("secret1", "message");
  const b = await hmacHex("secret1", "message");
  assert.equal(a, b);
  assert.equal(a.length, 64); // SHA-256 hex
  assert.notEqual(a, await hmacHex("secret2", "message"));
  assert.notEqual(a, await hmacHex("secret1", "different"));
});

test("timingSafeEqual compares equal/unequal strings correctly, rejects length mismatch and non-strings", () => {
  assert.equal(timingSafeEqual("abc", "abc"), true);
  assert.equal(timingSafeEqual("abc", "abd"), false);
  assert.equal(timingSafeEqual("abc", "ab"), false);
  assert.equal(timingSafeEqual("abc", 123), false);
  assert.equal(timingSafeEqual(undefined, undefined), false);
});

test("makeCode + verifyCode round-trip: a genuine code's embedded id verifies", async () => {
  const secret = "test-code-secret";
  const code = await makeCode(secret, "pi_3Nx7Kf2eZvKYlo2C1a2b3c4d");
  assert.match(code, /^pi_3Nx7Kf2eZvKYlo2C1a2b3c4d\.[0-9a-f]{10}$/);
  assert.equal(await verifyCode(secret, code), "pi_3Nx7Kf2eZvKYlo2C1a2b3c4d");
});

test("verifyCode rejects a tampered signature, a tampered id, a wrong secret, and malformed input", async () => {
  const secret = "test-code-secret";
  const code = await makeCode(secret, "sub_1AbCdEfGhIjKlMn");
  const [id, sig] = code.split(".");

  assert.equal(await verifyCode(secret, id + ".0000000000"), null, "tampered signature");
  assert.equal(await verifyCode(secret, "sub_DIFFERENT." + sig), null, "tampered id");
  assert.equal(await verifyCode("wrong-secret", code), null, "wrong secret");
  assert.equal(await verifyCode(secret, "not-a-real-code"), null, "no dot separator");
  assert.equal(await verifyCode(secret, ""), null, "empty string");
});

test("tierForStripeId maps Stripe id prefixes; unrecognised prefixes return null", () => {
  assert.equal(tierForStripeId("pi_3Nx7Kf2eZvKYlo2C1a2b3c4d"), "lifetime");
  assert.equal(tierForStripeId("sub_1AbCdEfGhIjKlMn"), "subscription");
  assert.equal(tierForStripeId("cus_randomvalue"), null);
  assert.equal(tierForStripeId(""), null);
});

test("contract constants match the PLAN.md A9 design", () => {
  assert.equal(REDEMPTION_CAP, 2);
  assert.equal(OFFLINE_GRACE_MS, 14 * 24 * 60 * 60 * 1000);
});
