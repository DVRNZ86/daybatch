// Dev-only support tool (D1 patch). Emails a customer their code when they
// don't have it — the post-checkout redirect never claimed it, they closed
// the tab too early, deleted the confirmation, etc. Calls the deployed
// Worker's protected /admin/send-code endpoint; the Stripe search, code
// derivation, and the send itself all happen server-side, using secrets
// (STRIPE_SECRET_KEY, CODE_SECRET, EMAIL_API_KEY) that only ever live in
// Cloudflare — this script never sees the code, only whether the send
// succeeded. Not part of the app, the Worker's fetch() handler beyond the
// one route, or the test suite.
//
// Before this works once:
//   1. `wrangler secret put ADMIN_KEY` (any long random string, keep it in
//      your password manager, never in git).
//   2. Pick an email provider and wire it into sendEmail() in
//      worker/daybatch-worker.js (currently a stub — see the TODO there),
//      then `wrangler secret put EMAIL_API_KEY` / `EMAIL_FROM`.
//
// Usage:
//   ADMIN_KEY=<the admin key> node send-code.mjs <customer email>
//   ADMIN_KEY=<the admin key> node send-code.mjs <email> --worker-url https://staging-worker.example
//
// Judgment call before running this: only send a code to an email you've
// satisfied yourself is the actual purchaser's (the one they checked out
// with). The endpoint sends to whatever address you give it — verifying the
// requester is on you, not the tool.
const [, , email, ...rest] = process.argv;
if (!email) {
  console.error("Usage: ADMIN_KEY=<key> node send-code.mjs <email> [--worker-url <url>]");
  process.exit(1);
}
const adminKey = process.env.ADMIN_KEY;
if (!adminKey) {
  console.error("Set ADMIN_KEY in the environment (don't pass it as an argument — it'd land in shell history).");
  process.exit(1);
}
const urlFlagIdx = rest.indexOf("--worker-url");
const workerUrl = urlFlagIdx >= 0 ? rest[urlFlagIdx + 1] : "https://daybatch-entitlement.daybatch.workers.dev";

const res = await fetch(`${workerUrl}/admin/send-code`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Admin-Key": adminKey },
  body: JSON.stringify({ email })
});
const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`✘ ${body.error || res.status}`);
  process.exit(1);
}
console.log(`✨ Code sent to ${email} (tier: ${body.tier})`);
