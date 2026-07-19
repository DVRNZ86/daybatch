# Daybatch entitlement Worker

Deploys separately from the static site — this is the one approved exception
to the app's zero-runtime-deps rule (PLAN.md A9). It is **not** part of the
npm project; nothing here is bundled into `src/`.

## What it does

Three endpoints, no database beyond one KV namespace for redemption counts:

- `POST /claim` — called right after a Stripe Payment Link redirect. Verifies
  the Checkout Session, derives a signed code from the Stripe payment/
  subscription id, returns it.
- `POST /redeem` — called by the app (`src/core/entitlement.js`). Verifies
  the code's signature, enforces the 2-activation cap, checks live Stripe
  status for subscriptions.
- `POST /webhook` — Stripe webhook signature verification. Not on the
  critical path yet; a landing point for future refund/chargeback handling.

## One-time setup

1. **Stripe account**, if not already created. Add three Payment Links:
   - $2/mo recurring subscription
   - $20/yr recurring subscription
   - $30 one-time payment (lifetime)

   For each Link, under "After payment", set the confirmation redirect to:
   `https://daybatch.app/?session_id={CHECKOUT_SESSION_ID}`
   (Stripe substitutes the real session id into that template.)

   **Done in TEST MODE, 15 Jul 2026** (live-mode links/prices must be
   re-created and these values swapped before launch):
   | Tier | Payment Link | Price id |
   |---|---|---|
   | Monthly $2 | https://buy.stripe.com/test_4gM9AUbZjfYO1mi7NX8Zq00 | `price_1Tur7XJNtMcPWsbdy3QzVx6N` |
   | Annual $20 | https://buy.stripe.com/test_9B6bJ29Rb27Y5Cyecl8Zq01 | `price_1TurFvJNtMcPWsbduVxZC2ER` |
   | Lifetime $30 | https://buy.stripe.com/test_7sY3cwbZj13U5Cy3xH8Zq02 | `price_1TurIBJNtMcPWsbdPEbmAqgp` |

   **Customer Portal** (subscribers cancel/manage there; identity = checkout
   email, no accounts our side) — activated in TEST MODE 19 Jul 2026, login
   link in `src/core/entitlement.js` PORTAL_URL. At launch: activate the
   portal again in LIVE mode (settings don't copy across) and swap
   PORTAL_URL together with PAYMENT_LINKS and the PRICE_* secrets.

2. **Cloudflare account**, if not already created. Install `wrangler` (the
   Cloudflare Workers CLI) — this is a one-off global/dev tool, not a project
   dependency:
   ```
   npm install -g wrangler
   wrangler login
   ```

3. **Create the KV namespace** (tracks redemption counts):
   ```
   wrangler kv namespace create CODES
   ```
   Note the returned namespace id.

4. **Create `worker/wrangler.toml`** (not checked in — contains no secrets
   itself, but is environment-specific):
   ```toml
   name = "daybatch-entitlement"
   main = "daybatch-worker.js"
   compatibility_date = "2026-07-14"

   [[kv_namespaces]]
   binding = "CODES"
   id = "<namespace id from step 3>"
   ```

5. **Set secrets** (never in wrangler.toml or git):
   ```
   wrangler secret put STRIPE_SECRET_KEY
   wrangler secret put STRIPE_WEBHOOK_SECRET
   wrangler secret put CODE_SECRET       # any long random string, independent of Stripe
   wrangler secret put PRICE_MONTHLY     # Stripe Price id for the $2/mo Payment Link
   wrangler secret put PRICE_YEARLY      # Stripe Price id for the $20/yr Payment Link
   wrangler secret put ALLOWED_ORIGIN    # comma-separated CORS allowlist:
                                         # https://daybatch.app,http://localhost:4173
                                         # (drop the localhost entry once D1 ships)
   ```

6. **Deploy**:
   ```
   wrangler deploy
   ```
   Note the resulting `*.workers.dev` URL (or map a custom subdomain).

7. **Point the app at it**: set `VERIFY_ENDPOINT` in
   `src/core/entitlement.js` to `<worker url>/redeem` (currently `null` —
   deliberately, so redemption fails with a clear "not live yet" message
   until this step happens). The `/claim` flow (auto-detecting
   `?session_id=` on load and redeeming automatically) is not wired into
   `main.js` yet — that's a small follow-up once the Worker is live and
   `VERIFY_ENDPOINT` is set, so it can be tested against the real endpoint
   rather than guessed at blind.

8. **Register the Stripe webhook** (dashboard → Developers → Webhooks):
   endpoint URL `<worker url>/webhook`, whichever events you want to observe
   first (not required for the core redeem flow to work).

## Known follow-up (not built yet)

Subscription codes are meant to re-verify against live Stripe status
**weekly**, with the `/redeem` response's `expiresAt` giving ~2 weeks of
offline grace on top of that (PLAN.md A9). The Worker supports this — the
client just calls `redeemCode()` again with the stored code — but no
periodic trigger exists client-side yet. Add one (e.g. on app focus, check
if the stored `expiresAt` is within a few days of expiring and silently
re-redeem) once there's a real subscription to test it against.

## Support playbook: "my code says it's used up" / device transfer

A code works on 2 devices (distinct device ids, tracked in KV). There is no
self-service deactivation — by design (A9: simple beats airtight). When a
legitimate customer runs out of slots (new phone + old phone + cleared
browser data, etc.), reset their code's activation list:

```
cd worker
npx wrangler kv key delete --binding CODES "redeem:<their full code>"
```

Their next redeem starts a fresh device count. The code itself never changes
and never expires — signature verification needs no KV entry.

## Testing

The Worker's pure crypto/parsing logic (`hmacHex`, `verifyCode`, `makeCode`,
`tierForStripeId`) is unit-tested in `tests/logic/worker.test.js` and runs
with the rest of the suite (`npm test`) — no Cloudflare or Stripe account
needed for that. The `fetch()` handler itself (the three endpoints) can only
be exercised against a real deploy with real Stripe test-mode data; there's
no local emulation of this in the repo.
