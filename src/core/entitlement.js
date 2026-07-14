// D1: redemption-code entitlement client. Talks to the one serverless verify
// function (A9) — the sole exception to the zero-runtime-deps rule. No
// accounts, no credentials stored beyond the entitlement record itself.
import { setEntitlement } from "./storage.js";

// Set once the Cloudflare Worker (A9) is deployed. null means "not wired up
// yet" — redeemCode fails fast with a clear message instead of silently
// no-op'ing or throwing.
export const VERIFY_ENDPOINT = null;

export async function redeemCode(code, fetchImpl = fetch, endpoint = VERIFY_ENDPOINT) {
  const trimmed = (code || "").trim();
  if (!trimmed) return { ok: false, error: "Enter a code." };
  if (!endpoint) return { ok: false, error: "Redemption isn't live yet — check back soon." };

  let res;
  try {
    res = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: trimmed })
    });
  } catch (e) {
    return { ok: false, error: "Network error — check your connection and try again." };
  }

  if (!res.ok) {
    if (res.status === 404) return { ok: false, error: "Code not recognised." };
    if (res.status === 409) return { ok: false, error: "This code has already been used the maximum number of times." };
    return { ok: false, error: "Something went wrong — try again shortly." };
  }

  let data;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!data || !data.tier) return { ok: false, error: "Unexpected response — try again shortly." };

  setEntitlement({ code: trimmed, tier: data.tier, verifiedAt: Date.now(), expiresAt: data.expiresAt ?? null });
  return { ok: true, tier: data.tier };
}
