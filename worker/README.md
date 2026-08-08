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
   wrangler secret put ADMIN_KEY         # any long random string, gates /admin/send-code
                                         # (send-code.mjs) — keep it in your password
                                         # manager, never in git
   # EMAIL_API_KEY / EMAIL_FROM: only needed once a provider is picked for
   # /admin/send-code — see "Known follow-up" and sendEmail()'s TODO below.
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

7. **Point the app at it**: done — `VERIFY_ENDPOINT`/`CLAIM_ENDPOINT` in
   `src/core/entitlement.js` point at
   `https://daybatch-entitlement.daybatch.workers.dev`. The `/claim` flow
   (`main.js` auto-detects `?session_id=` on load, claims, redeems, scrubs
   the URL) is wired and live-tested against real Stripe test-mode
   purchases (lifetime + a cancelled subscription). At launch, swap this
   for the live-mode Worker URL if it differs (same Worker, live secrets).

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

`/admin/send-code`'s `sendEmail()` has no provider wired up yet (Darren, 8
Aug 2026: decided to build the hook now, pick a provider later). Options
considered: Resend (simplest REST API, generous free tier), Postmark
(strongest transactional deliverability, no free tier), SendGrid (shared-IP
reputation risk at low volume). Whichever is picked needs its own account,
`daybatch.app` domain verification (SPF/DKIM) for deliverability, and its
API call dropped into the `TODO` in `sendEmail()` — no SDK, same
call-the-REST-API-via-fetch() pattern as Stripe.

## Support playbook: "my code says it's used up" / device transfer

A code works on 2 devices (distinct device ids, tracked in KV). There is no
self-service deactivation — by design (A9: simple beats airtight). When a
legitimate customer runs out of slots (new phone + old phone + cleared
browser data, etc.):

```
cd worker
node reset-code.mjs "<their full code>"
```

Their next redeem starts a fresh device count. The code itself never changes
and never expires — signature verification needs no KV entry.

**One free reset per code, enforced by the script.** A reset wipes the
device list to empty — unrestricted resets would let one purchase support
unlimited people via periodic "I lost my phone" requests, which is a
materially bigger leak than the 2-device cap was ever meant to allow. The
script tracks a reset count in KV and refuses a second reset for the same
code unless you pass `--force` after satisfying yourself it's genuine (e.g.
ask what happened to the previous two devices):

```
node reset-code.mjs "<code>" --force
```

## Support playbook: "I paid but I don't have my code"

Happens when the post-checkout redirect never claimed it (tab closed too
early, browser killed mid-flow, confirmation email deleted). The code is
fully derivable from the Stripe payment/subscription id at any time — there
is no time limit and no need to redo the purchase:

```
cd worker
ADMIN_KEY="<the admin key from your password manager>" node send-code.mjs "<their email>"
```

This finds every Stripe Customer on that email (someone can end up with more
than one if they checked out twice), pools their payments and subscriptions,
picks the same code `/claim` would have given them right after checkout (a
succeeded one-time payment is preferred over a subscription; ties go to the
most recent), and **emails it to that address** — the code is never printed
by this script or returned by the endpoint, only confirmation that a send
happened. That's deliberate: knowing someone's email isn't proof you *are*
them, but only the real owner can read what lands in their inbox.

**Requires an email provider to be wired up first** (not done as of this
writing — `sendEmail()` in `daybatch-worker.js` is a stub with a `TODO`
where the real API call goes). Until a provider is picked and its
`EMAIL_API_KEY`/`EMAIL_FROM` secrets are set, this errors clearly
(`email sending not configured`) rather than silently failing.

**Verify the requester before running this** — anyone who knows an email
address can trigger a send to it. Confirm it's the email they actually
checked out with (ask them to quote the last 4 of the card, or check it
against the Stripe dashboard) before running the command.

If it comes back `no Stripe customer found for that email` or `no successful
payment or active subscription found`, the email doesn't match any completed
Stripe checkout under that address — check the Stripe dashboard directly for
a typo'd email or a payment still stuck in a pending/failed state before
concluding they never actually paid.

## Testing

The Worker's pure crypto/parsing logic (`hmacHex`, `verifyCode`, `makeCode`,
`tierForStripeId`) is unit-tested in `tests/logic/worker.test.js` and runs
with the rest of the suite (`npm test`) — no Cloudflare or Stripe account
needed for that. The `fetch()` handler itself (the three endpoints) can only
be exercised against a real deploy with real Stripe test-mode data; there's
no local emulation of this in the repo.
