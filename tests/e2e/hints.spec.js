// D1: premium hints on Sonar and Codebreak.
import { test, expect } from "@playwright/test";
import { gen as genSonar, tierFor as snTierFor } from "../../src/games/sonar.js";
import { gen as genCodebreak, tierFor as cbTierFor } from "../../src/games/codebreak.js";
import { dailySeed } from "../../src/core/rng.js";

async function seedPremium(page) {
  await page.addInitScript(() => {
    localStorage.setItem("daybatch:v1", JSON.stringify({
      schema: 1, lastSeenDate: null, games: {}, history: [],
      premium: { code: "LIFETIME1", tier: "lifetime", verifiedAt: Date.now(), expiresAt: null }
    }));
  });
}
async function openTab(page, tab) {
  await page.goto("/");
  await page.locator(`.tabs button[data-tab="${tab}"]`).click();
  await expect(page.locator(`#pane-${tab} .board`)).toBeVisible();
}

test("Hint buttons are premium-only, on Sonar and Codebreak", async ({ page }) => {
  await openTab(page, "sonar");
  await expect(page.locator("#sn-hint")).toHaveCount(0);
  await openTab(page, "codebreak");
  await expect(page.locator("#cb-hint")).toHaveCount(0);
});

test("Sonar hint reveals a guaranteed hit and counts as a normal ping", async ({ page }) => {
  await seedPremium(page);
  await page.goto("/");
  await page.locator('.tabs button[data-tab="sonar"]').click();

  await page.locator("#sn-hint").click();
  await expect(page.locator("#pane-sonar .stat.big").filter({ hasText: "PINGS" }).locator(".vl")).toHaveText("1");
  await expect(page.locator("#pane-sonar .stat.big").filter({ hasText: "FOUND" }).locator(".vl")).toHaveText("1/7");
  await expect(page.locator(".sn-row button.hit")).toHaveCount(1);
});

test("Sonar hint can finish the game (all 7 hints) with a normal win modal", async ({ page }) => {
  test.setTimeout(30000);
  await seedPremium(page);
  await page.goto("/");
  await page.locator('.tabs button[data-tab="sonar"]').click();

  for (let i = 0; i < 7; i++) await page.locator("#sn-hint").click();
  await expect(page.locator("#overlay.show")).toBeVisible();
  await expect(page.locator("#pane-sonar .stat.big").filter({ hasText: "FOUND" }).locator(".vl")).toHaveText("7/7");
});

test("Sonar hint: D1 patch — 1 hint + a flawless finish still degrades the recorded tier", async ({ page }) => {
  // Before the patch, a hint cost exactly 1 ping like a real tap, so a
  // player who otherwise played perfectly could farm tier 1 for free.
  // hintsUsed now doubles that cost and forfeits tier 1 outright.
  await seedPremium(page);
  await page.goto("/");
  await page.locator('.tabs button[data-tab="sonar"]').click();

  const ships = [...genSonar(dailySeed("sonar")).occ];
  await page.locator("#sn-hint").click(); // 1 hint: reveals ships[0]
  for (const i of ships.slice(1)) await page.locator(`.sn-row button[data-i="${i}"]`).click();
  await expect(page.locator("#overlay.show")).toBeVisible();

  const h = await page.evaluate(() => JSON.parse(localStorage.getItem("daybatch:v1")).history);
  const record = h.find(r => r.game === "sonar");
  expect(record.metrics).toEqual({ pings: 7, hintsUsed: 1, win: true });
  expect(snTierFor(7)).toBe(1); // 7 pings alone would be a perfect tier 1
  expect(record.tier).toBe(snTierFor(7, 1));
  expect(record.tier).toBe(2); // one hint is enough to forfeit it
});

test("Codebreak hint reveals a slot without touching the in-progress guess, and penalizes the recorded tier", async ({ page }) => {
  await seedPremium(page);
  await page.goto("/");
  await page.locator('.tabs button[data-tab="codebreak"]').click();

  await page.locator("#cb-hint").click();
  await expect(page.locator("#pane-codebreak").getByText("Hints: #")).toBeVisible();
  await expect(page.locator(".cb-slot.filled")).toHaveCount(0); // current guess untouched
  await expect(page.locator("#pane-codebreak .stat.big .vl")).toHaveText("0/8"); // GUESSES unaffected by hint

  // a second hint reveals a different slot
  await page.locator("#cb-hint").click();
  const hintsText = await page.locator("#pane-codebreak").locator("text=Hints:").textContent();
  expect(hintsText.match(/#\d/g).length).toBe(2);
});

test("Codebreak hint: 2 hints + a 1-guess daily win degrades the recorded tier, per tierFor(guesses+hints)", async ({ page }) => {
  await seedPremium(page);
  await page.goto("/");
  await page.locator('.tabs button[data-tab="codebreak"]').click();

  await page.locator("#cb-hint").click();
  await page.locator("#cb-hint").click();

  const code = genCodebreak(dailySeed("codebreak"));
  for (const s of code) await page.locator(`.cb-keys button[data-k="${s}"]`).click();
  await page.locator("#cb-sub").click();
  await expect(page.locator("#overlay.show")).toBeVisible();

  const h = await page.evaluate(() => JSON.parse(localStorage.getItem("daybatch:v1")).history);
  const record = h.find(r => r.game === "codebreak");
  expect(record.metrics).toEqual({ guesses: 1, hints: 2, win: true });
  // 1 guess alone would be tier 1 (g<=2); +2 hints pushes the tierFor input
  // to 3, landing tier 2 — the hint penalty actually reached storage.
  expect(cbTierFor("win", 1)).toBe(1);
  expect(record.tier).toBe(cbTierFor("win", 1 + 2));
  expect(record.tier).toBe(2);
});
