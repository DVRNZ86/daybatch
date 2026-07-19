// D1: redemption-code entitlement client. Talks to the one serverless verify
// function (A9) — the sole exception to the zero-runtime-deps rule. No
// accounts, no credentials stored beyond the entitlement record itself.
import { setEntitlement, clearEntitlement, getEntitlement, getDeviceId } from "./storage.js";

const WORKER = "https://daybatch-entitlement.daybatch.workers.dev";
export const VERIFY_ENDPOINT = WORKER + "/redeem";
export const CLAIM_ENDPOINT = WORKER + "/claim";

// Stripe Payment Links — TEST MODE values (see worker/README.md). Swap for
// the live-mode links before launch; the tier keys are the contract.
export const PAYMENT_LINKS = {
  monthly: "https://buy.stripe.com/test_4gM9AUbZjfYO1mi7NX8Zq00",
  yearly: "https://buy.stripe.com/test_9B6bJ29Rb27Y5Cyecl8Zq01",
  lifetime: "https://buy.stripe.com/test_7sY3cwbZj13U5Cy3xH8Zq02"
};

// Stripe Customer Portal login — TEST MODE (swap for live at launch, and
// activate the portal in live mode first; settings don't copy across).
// Subscribers cancel/manage there; identity is their checkout email, so no
// accounts on our side. Irrelevant to lifetime purchases.
export const PORTAL_URL = "https://billing.stripe.com/p/login/test_4gM9AUbZjfYO1mi7NX8Zq00";

// How close to the entitlement's expiresAt we start silently re-verifying.
// expiresAt = verification time + 2 weeks (Worker's OFFLINE_GRACE_MS), so
// re-verifying once inside the final week ≈ the weekly cadence A9 asks for,
// while a full week of failures still leaves premium intact.
export const REVERIFY_MARGIN_MS = 7 * 24 * 60 * 60 * 1000;

export async function redeemCode(code, fetchImpl = fetch, endpoint = VERIFY_ENDPOINT) {
  const trimmed = (code || "").trim();
  if (!trimmed) return { ok: false, error: "Enter a code." };
  if (!endpoint) return { ok: false, error: "Redemption isn't live yet — check back soon." };

  let res;
  try {
    res = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: trimmed, device: getDeviceId() })
    });
  } catch (e) {
    return { ok: false, error: "Network error — check your connection and try again.", network: true };
  }

  if (!res.ok) {
    if (res.status === 404) return { ok: false, status: 404, error: "Code not recognised." };
    if (res.status === 409) return { ok: false, status: 409, error: "This code has already been used the maximum number of times." };
    return { ok: false, status: res.status, error: "Something went wrong — try again shortly." };
  }

  let data;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!data || !data.tier) return { ok: false, error: "Unexpected response — try again shortly." };

  setEntitlement({ code: trimmed, tier: data.tier, verifiedAt: Date.now(), expiresAt: data.expiresAt ?? null });
  return { ok: true, tier: data.tier };
}

// Post-checkout claim: Stripe's Payment Link redirects back with
// ?session_id=cs_...; exchange it for a code, then redeem immediately.
export async function claimSession(sessionId, fetchImpl = fetch, endpoint = CLAIM_ENDPOINT) {
  if (!sessionId) return { ok: false, error: "No checkout session." };
  let res;
  try {
    res = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId })
    });
  } catch (e) {
    return { ok: false, error: "Network error — your code is safe; open this link again when online.", network: true };
  }
  let data;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok || !data || !data.code) {
    return { ok: false, error: (data && data.error) === "payment not complete" ? "Payment not completed." : "Couldn't fetch your code — try again shortly." };
  }
  const redeemed = await redeemCode(data.code, fetchImpl);
  return redeemed.ok ? { ok: true, tier: redeemed.tier, code: data.code } : redeemed;
}

// Subscription upkeep (A9): silently re-verify when inside the final week of
// the grace window. Revokes on a definitive server "no" (cancelled sub, cap,
// bad code); network failures leave the current grace period running.
// Returns true if anything changed (caller refreshes UI).
export async function maybeReverify(fetchImpl = fetch, now = Date.now()) {
  const e = getEntitlement();
  if (!e || e.tier === "lifetime" || typeof e.expiresAt !== "number") return false;
  if (now < e.expiresAt - REVERIFY_MARGIN_MS) return false;

  const r = await redeemCode(e.code, fetchImpl);
  if (r.ok) return true; // fresh expiresAt stored by redeemCode
  if (r.status === 404 || r.status === 409) { clearEntitlement(); return true; }
  return false; // network / transient server trouble: existing grace stands
}
