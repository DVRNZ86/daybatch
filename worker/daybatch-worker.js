// Daybatch entitlement Worker (D1, PLAN.md A9) — the sole exception to the
// app's zero-runtime-deps rule (CLAUDE.md). Deployed separately from the
// static site (Cloudflare Workers), not part of the npm project or its
// dependency graph. No `stripe` package: Stripe's REST API is called
// directly via fetch(), keeping the Worker itself dependency-free too.
//
// Endpoints:
//
//   POST /claim   { session_id } -> { code, tier }
//     Called once, right after Stripe redirects back from a Payment Link
//     (the Link's redirect URL must include "?session_id={CHECKOUT_SESSION_ID}").
//     Verifies the Checkout Session with Stripe, derives a signed code from
//     the underlying payment_intent (lifetime) or subscription (monthly/
//     yearly) id, and returns it so the client can redeem immediately.
//
//   POST /redeem  { code } -> { tier, expiresAt }
//     Called by the app's entitlement.js (src/core/entitlement.js). Verifies
//     the code's HMAC signature (self-contained — no lookup needed to check
//     authenticity), enforces the 2-activation cap via KV, and for
//     subscriptions checks live Stripe status. expiresAt is a local
//     re-verification deadline (see README's "offline grace" note), not the
//     Stripe billing period end.
//
//   POST /webhook
//     Verifies Stripe's webhook signature. Not on the critical path (the
//     flow above is pull-based via session_id) — a landing point for future
//     extensions such as refund/chargeback code revocation.
//
// Required bindings/env vars — see worker/README.md for setup:
//   env.CODES              KV namespace: tracks per-code redemption counts
//   env.STRIPE_SECRET_KEY
//   env.STRIPE_WEBHOOK_SECRET
//   env.CODE_SECRET         HMAC signing key for codes (independent of Stripe)
//   env.PRICE_MONTHLY, env.PRICE_YEARLY   Stripe Price IDs, to tell the two
//                                          subscription tiers apart
//   env.ALLOWED_ORIGIN      CORS allowlist; comma-separated, e.g.
//                           "https://daybatch.app,http://localhost:4173"

export const REDEMPTION_CAP = 2;
export const OFFLINE_GRACE_MS = 14 * 24 * 60 * 60 * 1000; // 2 weeks

// ---- pure helpers (exported for direct Node testing — no Cloudflare/Stripe
// runtime needed to test the crypto/parsing logic itself) ----

export async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// code = "<stripe id>.<10-hex-char HMAC signature>" — self-contained, so
// verifying a code never needs a database round-trip.
export async function makeCode(codeSecret, stripeId) {
  const sig = (await hmacHex(codeSecret, stripeId)).slice(0, 10);
  return stripeId + "." + sig;
}

// Returns the embedded Stripe id if the code's signature is valid, else null.
export async function verifyCode(codeSecret, code) {
  const dot = code.lastIndexOf(".");
  if (dot < 0) return null;
  const id = code.slice(0, dot), sig = code.slice(dot + 1);
  const expected = (await hmacHex(codeSecret, id)).slice(0, 10);
  return timingSafeEqual(sig, expected) ? id : null;
}

export function tierForStripeId(id) {
  if (id.startsWith("pi_")) return "lifetime";
  if (id.startsWith("sub_")) return "subscription"; // monthly vs yearly resolved from live Stripe data
  return null;
}

// ALLOWED_ORIGIN may be a comma-separated list (e.g. production + localhost
// for pre-merge testing). CORS allows exactly one origin per response, so:
// echo the request's own origin when it's on the list, else fall back to the
// list's first entry (the browser then blocks the response — the fallback is
// just a deterministic header value, not an access grant).
export function resolveOrigin(allowed, requestOrigin) {
  if (!allowed) return null;
  const list = allowed.split(",").map(s => s.trim()).filter(Boolean);
  if (!list.length) return null;
  return list.includes(requestOrigin) ? requestOrigin : list[0];
}

// ---- Cloudflare/Stripe runtime glue ----

function json(body, status = 200, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(origin ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin" } : {})
    }
  });
}

async function stripeGet(env, path) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: "Bearer " + env.STRIPE_SECRET_KEY }
  });
  if (!res.ok) throw new Error("stripe " + res.status + " on " + path);
  return res.json();
}

async function handleClaim(req, env, origin) {
  const { session_id } = await req.json();
  if (!session_id) return json({ error: "session_id required" }, 400, origin);

  let session;
  try {
    session = await stripeGet(env, `checkout/sessions/${session_id}`);
  } catch (e) {
    return json({ error: "session lookup failed" }, 404, origin);
  }
  if (session.payment_status !== "paid" && session.status !== "complete") {
    return json({ error: "payment not complete" }, 402, origin);
  }

  const stripeId = session.mode === "subscription" ? session.subscription : session.payment_intent;
  if (!stripeId) return json({ error: "no payment/subscription on session" }, 500, origin);

  const code = await makeCode(env.CODE_SECRET, stripeId);
  return json({ code, tier: tierForStripeId(stripeId) }, 200, origin);
}

async function handleRedeem(req, env, origin) {
  const { code } = await req.json();
  if (!code) return json({ error: "code required" }, 400, origin);

  const id = await verifyCode(env.CODE_SECRET, code);
  if (!id) return json({ error: "not recognised" }, 404, origin);

  const countKey = "redeem:" + code;
  const count = parseInt((await env.CODES.get(countKey)) || "0", 10);
  // Deliberately not airtight (KV is eventually consistent, so a tight race
  // near the cap can slip through) — the cap's job is discouraging casual
  // sharing, not preventing it outright (PLAN.md A9, accepted trade-off).
  if (count >= REDEMPTION_CAP) return json({ error: "redemption cap reached" }, 409, origin);

  const kind = tierForStripeId(id);
  if (kind === "lifetime") {
    await env.CODES.put(countKey, String(count + 1));
    return json({ tier: "lifetime", expiresAt: null }, 200, origin);
  }
  if (kind === "subscription") {
    let sub;
    try {
      sub = await stripeGet(env, `subscriptions/${id}`);
    } catch (e) {
      return json({ error: "stripe lookup failed" }, 502, origin);
    }
    if (sub.status !== "active" && sub.status !== "trialing") {
      return json({ error: "subscription not active" }, 404, origin);
    }
    const priceId = sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].price && sub.items.data[0].price.id;
    const tier = priceId === env.PRICE_YEARLY ? "yearly" : "monthly";
    await env.CODES.put(countKey, String(count + 1));
    return json({ tier, expiresAt: Date.now() + OFFLINE_GRACE_MS }, 200, origin);
  }
  return json({ error: "unrecognised id type" }, 500, origin);
}

async function handleWebhook(req, env) {
  const sigHeader = req.headers.get("Stripe-Signature") || "";
  const body = await req.text();
  const parts = Object.fromEntries(sigHeader.split(",").map(p => p.split("=")));
  const expected = await hmacHex(env.STRIPE_WEBHOOK_SECRET, `${parts.t}.${body}`);
  if (!timingSafeEqual(parts.v1 || "", expected)) return json({ error: "bad signature" }, 400);
  // event = JSON.parse(body); — no handling needed yet; the redeem flow
  // above is pull-based. Extension point for refund/chargeback revocation.
  return json({ received: true });
}

export default {
  async fetch(req, env) {
    const origin = resolveOrigin(env.ALLOWED_ORIGIN, req.headers.get("Origin") || "");
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }});
    }
    const url = new URL(req.url);
    if (req.method === "POST" && url.pathname === "/claim") return handleClaim(req, env, origin);
    if (req.method === "POST" && url.pathname === "/redeem") return handleRedeem(req, env, origin);
    if (req.method === "POST" && url.pathname === "/webhook") return handleWebhook(req, env);
    return json({ error: "not found" }, 404, origin);
  }
};
