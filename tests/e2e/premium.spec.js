// D1: premium entitlement UI. The 👑 header badge and help-overlay status
// row both read storage.js's isPremium() — this locks their visibility to
// the entitlement record shape (tier, expiresAt).
//
// Every network path to the entitlement Worker is stubbed with page.route:
// the suite must stay green offline and never depends on (or spams) the
// live Cloudflare deployment.
import { test, expect } from "@playwright/test";

const WORKER = "https://daybatch-entitlement.daybatch.workers.dev";

async function seedEntitlement(page, entitlement) {
  await page.addInitScript((premium) => {
    const root = { schema: 1, lastSeenDate: null, games: {}, history: [] };
    if (premium) root.premium = premium;
    localStorage.setItem("daybatch:v1", JSON.stringify(root));
  }, entitlement);
}

// Stub the Worker: responder(path, body) -> { status, body }.
async function stubWorker(page, responder) {
  const calls = [];
  await page.route(WORKER + "/**", async (route) => {
    const url = new URL(route.request().url());
    const body = route.request().postDataJSON();
    calls.push({ path: url.pathname, body });
    const r = responder(url.pathname, body);
    await route.fulfill({ status: r.status, contentType: "application/json", body: JSON.stringify(r.body) });
  });
  return calls;
}

test("free tier: no crown badge, help overlay shows Free plan / Unlock premium", async ({ page }) => {
  await seedEntitlement(page, null);
  await page.goto("/");
  await expect(page.locator("#hdr-premium")).toBeHidden();

  await page.locator("button:text('?')").first().click();
  await expect(page.locator("#h-premium-status")).toHaveText("Free plan");
  await expect(page.locator("#h-premium-open")).toHaveText("Unlock premium");
});

test("lifetime premium: crown badge shown, help overlay reflects tier, no network", async ({ page }) => {
  const calls = await stubWorker(page, () => ({ status: 500, body: {} }));
  await seedEntitlement(page, { code: "pi_x.abc", tier: "lifetime", verifiedAt: Date.now(), expiresAt: null });
  await page.goto("/");
  await expect(page.locator("#hdr-premium")).toBeVisible();

  await page.locator("button:text('?')").first().click();
  await expect(page.locator("#h-premium-status")).toHaveText("Premium · Lifetime");
  await expect(page.locator("#h-premium-open")).toHaveText("Manage");
  expect(calls).toEqual([]); // lifetime never re-verifies
});

test("expired subscription: treated as free; boot re-verify revokes it for real on a definitive 404", async ({ page }) => {
  await stubWorker(page, () => ({ status: 404, body: { error: "subscription not active" } }));
  await seedEntitlement(page, { code: "sub_x.abc", tier: "monthly", verifiedAt: Date.now(), expiresAt: Date.now() - 1000 });
  await page.goto("/");
  await expect(page.locator("#hdr-premium")).toBeHidden();

  await page.locator("button:text('?')").first().click();
  await expect(page.locator("#h-premium-status")).toHaveText("Free plan");
  // the revocation persisted: the entitlement record is gone, not just hidden
  await expect
    .poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("daybatch:v1")).premium ?? null))
    .toBeNull();
});

test("aging subscription: boot re-verify refreshes the grace window silently", async ({ page }) => {
  const newExpiry = Date.now() + 14 * 86400000;
  const calls = await stubWorker(page, () => ({ status: 200, body: { tier: "monthly", expiresAt: newExpiry } }));
  await seedEntitlement(page, { code: "sub_x.abc", tier: "monthly", verifiedAt: 0, expiresAt: Date.now() + 60000 });
  await page.goto("/");

  await expect(page.locator("#hdr-premium")).toBeVisible();
  await expect.poll(() => calls.length).toBeGreaterThan(0);
  expect(calls[0].path).toBe("/redeem");
  expect(calls[0].body.device).toBeTruthy();
  await expect
    .poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("daybatch:v1")).premium.expiresAt))
    .toBe(newExpiry);
});

test("redeem overlay: bad code shows the server's rejection; good code unlocks and shows the crown", async ({ page }) => {
  await stubWorker(page, (path, body) =>
    body.code === "GOODCODE"
      ? { status: 200, body: { tier: "lifetime", expiresAt: null } }
      : { status: 404, body: { error: "not recognised" } });
  await seedEntitlement(page, null);
  await page.goto("/");
  await page.locator("button:text('?')").first().click();
  await page.locator("#h-premium-open").click();
  await expect(page.locator("#premiumov.show")).toBeVisible();

  await page.locator("#pm-code").fill("BADCODE");
  await page.locator("#pm-redeem").click();
  await expect(page.locator("#pm-msg")).toHaveText(/not recognised/i);
  await expect(page.locator("#hdr-premium")).toBeHidden();

  await page.locator("#pm-code").fill("GOODCODE");
  await page.locator("#pm-redeem").click();
  await expect(page.locator("#pm-msg")).toHaveText(/unlocked/i);
  await expect(page.locator("#hdr-premium")).toBeVisible();
});

test("post-checkout: ?session_id= claims, redeems, confirms, and scrubs the URL", async ({ page }) => {
  await stubWorker(page, (path) =>
    path === "/claim"
      ? { status: 200, body: { code: "pi_new.1234567890", tier: "lifetime" } }
      : { status: 200, body: { tier: "lifetime", expiresAt: null } });
  await seedEntitlement(page, null);
  await page.goto("/?session_id=cs_test_abc123");

  await expect(page.locator("#premiumov.show")).toBeVisible();
  await expect(page.locator("#pm-msg")).toHaveText(/unlocked/i);
  await expect(page.locator("#hdr-premium")).toBeVisible();
  expect(new URL(page.url()).search).toBe(""); // session_id scrubbed
});

test("purchase buttons navigate to the Stripe Payment Links", async ({ page }) => {
  await seedEntitlement(page, null);
  await page.goto("/");
  await page.locator("button:text('?')").first().click();
  await page.locator("#h-premium-open").click();

  // Block the external navigation; just assert where it was headed.
  let target = null;
  await page.route("https://buy.stripe.com/**", async (route) => {
    target = route.request().url();
    await route.abort();
  });
  await page.locator("#pm-buy button[data-tier='lifetime']").click();
  await expect.poll(() => target).toContain("buy.stripe.com");
});
