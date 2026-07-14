// D1: premium entitlement UI. The 👑 header badge and help-overlay status
// row both read storage.js's isPremium() — this locks their visibility to
// the entitlement record shape (tier, expiresAt).
import { test, expect } from "@playwright/test";

async function seedEntitlement(page, entitlement) {
  await page.addInitScript((premium) => {
    const root = { schema: 1, lastSeenDate: null, games: {}, history: [] };
    if (premium) root.premium = premium;
    localStorage.setItem("daybatch:v1", JSON.stringify(root));
  }, entitlement);
}

test("free tier: no crown badge, help overlay shows Free plan / Unlock premium", async ({ page }) => {
  await seedEntitlement(page, null);
  await page.goto("/");
  await expect(page.locator("#hdr-premium")).toBeHidden();

  await page.locator("button:text('?')").first().click();
  await expect(page.locator("#h-premium-status")).toHaveText("Free plan");
  await expect(page.locator("#h-premium-open")).toHaveText("Unlock premium");
});

test("lifetime premium: crown badge shown, help overlay reflects tier", async ({ page }) => {
  await seedEntitlement(page, { code: "LIFETIME1", tier: "lifetime", verifiedAt: Date.now(), expiresAt: null });
  await page.goto("/");
  await expect(page.locator("#hdr-premium")).toBeVisible();

  await page.locator("button:text('?')").first().click();
  await expect(page.locator("#h-premium-status")).toHaveText("Premium · Lifetime");
  await expect(page.locator("#h-premium-open")).toHaveText("Manage");
});

test("expired subscription: treated as free, no crown badge", async ({ page }) => {
  await seedEntitlement(page, { code: "SUB1", tier: "monthly", verifiedAt: Date.now(), expiresAt: Date.now() - 1000 });
  await page.goto("/");
  await expect(page.locator("#hdr-premium")).toBeHidden();

  await page.locator("button:text('?')").first().click();
  await expect(page.locator("#h-premium-status")).toHaveText("Free plan");
});

test("redeem overlay: entering a code before the Worker is live shows a clear error, sets nothing", async ({ page }) => {
  await seedEntitlement(page, null);
  await page.goto("/");
  await page.locator("button:text('?')").first().click();
  await page.locator("#h-premium-open").click();
  await expect(page.locator("#premiumov.show")).toBeVisible();

  await page.locator("#pm-code").fill("TESTCODE");
  await page.locator("#pm-redeem").click();
  await expect(page.locator("#pm-msg")).toHaveText(/live yet/i);
  await expect(page.locator("#hdr-premium")).toBeHidden();

  await page.locator("#pm-close").click();
  await expect(page.locator("#premiumov.show")).toBeHidden();
});
