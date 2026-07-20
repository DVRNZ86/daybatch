// D1: Cloudflare Worker (worker/daybatch-worker.js) — pure crypto/parsing
// logic only. The fetch() handler itself needs Cloudflare's runtime + a
// real Stripe account, neither of which exist in this repo; those endpoints
// are exercised manually once Darren deploys (see worker/README.md).
import test from "node:test";
import assert from "node:assert/strict";
import { hmacHex, timingSafeEqual, makeCode, verifyCode, tierForStripeId, resolveOrigin, applyActivation, shouldAllowReset, REDEMPTION_CAP, OFFLINE_GRACE_MS, FREE_RESET_CAP } from "../../worker/daybatch-worker.js";

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

test("resolveOrigin: comma-separated allowlist echoes a listed origin, falls back to the first entry otherwise", () => {
  const allowed = "https://daybatch.app,http://localhost:4173";
  assert.equal(resolveOrigin(allowed, "https://daybatch.app"), "https://daybatch.app");
  assert.equal(resolveOrigin(allowed, "http://localhost:4173"), "http://localhost:4173");
  assert.equal(resolveOrigin(allowed, "https://evil.example"), "https://daybatch.app", "unlisted origin gets the first entry (browser then blocks)");
  assert.equal(resolveOrigin(allowed, ""), "https://daybatch.app");
  assert.equal(resolveOrigin("https://daybatch.app", "https://daybatch.app"), "https://daybatch.app", "single-entry list still works");
  assert.equal(resolveOrigin(" https://a.example , https://b.example ", "https://b.example"), "https://b.example", "whitespace around entries is tolerated");
  assert.equal(resolveOrigin(undefined, "https://daybatch.app"), null, "unset env var");
  assert.equal(resolveOrigin("", "https://daybatch.app"), null, "empty env var");
});

test("applyActivation: cap counts distinct devices; a known device re-verifying never consumes an activation", () => {
  // first device on a fresh code
  let r = applyActivation(null, "dev-A", 2);
  assert.deepEqual(r, { allowed: true, changed: true, devices: ["dev-A"] });

  // same device again (weekly subscription re-verify) — allowed, no growth
  r = applyActivation(JSON.stringify(["dev-A"]), "dev-A", 2);
  assert.deepEqual(r, { allowed: true, changed: false, devices: ["dev-A"] });

  // second distinct device — fills the cap
  r = applyActivation(JSON.stringify(["dev-A"]), "dev-B", 2);
  assert.deepEqual(r, { allowed: true, changed: true, devices: ["dev-A", "dev-B"] });

  // third device — rejected; both known devices still allowed
  assert.equal(applyActivation(JSON.stringify(["dev-A", "dev-B"]), "dev-C", 2).allowed, false);
  assert.equal(applyActivation(JSON.stringify(["dev-A", "dev-B"]), "dev-A", 2).allowed, true);
  assert.equal(applyActivation(JSON.stringify(["dev-A", "dev-B"]), "dev-B", 2).allowed, true);

  // junk KV data degrades to an empty list rather than throwing
  assert.deepEqual(applyActivation("{not json", "dev-A", 2), { allowed: true, changed: true, devices: ["dev-A"] });
  assert.deepEqual(applyActivation('"a string"', "dev-A", 2), { allowed: true, changed: true, devices: ["dev-A"] });
});

test("shouldAllowReset: one free reset per code, further resets need --force", () => {
  assert.equal(FREE_RESET_CAP, 1);

  // never reset before: allowed without force
  assert.deepEqual(shouldAllowReset(0, false), { allowed: true });

  // at the cap: refused, with a reason explaining why and how to override
  const refused = shouldAllowReset(1, false);
  assert.equal(refused.allowed, false);
  assert.match(refused.reason, /already been reset 1 time/i);
  assert.match(refused.reason, /--force/);

  // force always wins, regardless of prior count
  assert.deepEqual(shouldAllowReset(1, true), { allowed: true });
  assert.deepEqual(shouldAllowReset(5, true), { allowed: true });

  // well past the cap without force: still refused
  assert.equal(shouldAllowReset(4, false).allowed, false);
});

test("contract constants match the PLAN.md A9 design", () => {
  assert.equal(REDEMPTION_CAP, 2);
  assert.equal(OFFLINE_GRACE_MS, 14 * 24 * 60 * 60 * 1000);
});
