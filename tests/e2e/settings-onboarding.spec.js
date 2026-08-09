// B5: first-run onboarding banner, settings overlay (haptics, colour-blind
// mode, personal-best records).
import { test, expect } from "@playwright/test";
import { gen as genCodebreak } from "../../src/games/codebreak.js";
import { dailySeed } from "../../src/core/rng.js";

async function openTab(page, tab) {
  await page.goto("/");
  await page.locator(`.tabs button[data-tab="${tab}"]`).click();
  await expect(page.locator(`#pane-${tab} .board`)).toBeVisible();
}

test("onboarding banner: shown on first visit, non-blocking, dismissible, gone after reload", async ({ page }) => {
  await page.goto("/");
  const banner = page.locator("#onboarding");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("Five puzzles. Every day. That's it.");

  // non-blocking: the board underneath is already usable without dismissing it first
  await expect(page.locator("#pane-sonar .board")).toBeVisible();
  await page.locator(".sn-row button").first().click();
  await expect(page.locator("#pane-sonar .stat.big .vl").first()).toHaveText("1");

  await page.locator("#ob-start").click();
  await expect(banner).toBeHidden();

  await page.reload();
  await expect(banner).toBeHidden();
});

test("Settings is reachable from the help overlay and shows haptics + colour-blind toggles", async ({ page }) => {
  await openTab(page, "sonar");
  await page.locator("#sn-help").click();
  await page.locator("#h-settings").click();
  await expect(page.locator("#settingsov.show")).toBeVisible();
  await expect(page.locator("#helpov.show")).toHaveCount(0);
  await expect(page.locator("#st-haptics")).toBeChecked();
  await expect(page.locator("#st-colorblind")).not.toBeChecked();
});

test("Haptics toggle persists and gates the win vibration", async ({ page }) => {
  await page.addInitScript(() => {
    window.__vibrateCalls = [];
    navigator.vibrate = (p) => { window.__vibrateCalls.push(p); return true; };
  });
  await openTab(page, "sonar");
  await page.locator("#sn-help").click();
  await page.locator("#h-settings").click();
  await page.locator("#st-haptics").uncheck();
  await page.locator("#st-close").click();

  await expect(page.evaluate(() => JSON.parse(localStorage.getItem("daybatch:v1")).hapticsEnabled)).resolves.toBe(false);

  // reopening settings later still reflects the persisted choice
  await page.reload();
  await page.locator("#sn-help").click();
  await page.locator("#h-settings").click();
  await expect(page.locator("#st-haptics")).not.toBeChecked();
});

test("Colour-blind mode adds a verdict badge to Codebreak tiles, on top of colour", async ({ page }) => {
  await openTab(page, "codebreak");
  const code = genCodebreak(dailySeed("codebreak"));
  for (const s of code) await page.locator(`.cb-keys button[data-k="${s}"]`).click();
  await page.locator("#cb-sub").click();
  await expect(page.locator("#overlay.show")).toBeVisible();
  await page.locator("#m-close").click(); // dismiss the win modal so #cb-help is reachable

  const tile = page.locator('.cb-tile[data-v="green"]').first();
  await expect(tile).toBeVisible(); // sanity: the verdict attribute is present

  // off by default: no badge glyph rendered
  let content = await tile.evaluate(el => getComputedStyle(el, "::after").content);
  expect(content === "none" || content === '""').toBeTruthy();

  await page.locator("#cb-help").click();
  await page.locator("#h-settings").click();
  await page.locator("#st-colorblind").check();
  await page.locator("#st-close").click();

  await expect(page.locator("body")).toHaveClass(/cb-mode/);
  content = await tile.evaluate(el => getComputedStyle(el, "::after").content);
  expect(content).toBe('"✓"');
});

// Records live in the History overlay, not Settings — PLAN.md B5: "stats
// screen (history, records)... premium-gated", so both need the same
// entitlement, not just history rows.
test("Records (in the premium History overlay) reflect Timed-mode bests once one exists", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("daybatch:v1", JSON.stringify({
      schema: 1, lastSeenDate: null, games: {}, history: [], onboardingShown: true,
      premium: { code: "LIFETIME1", tier: "lifetime", verifiedAt: Date.now(), expiresAt: null },
      bestTimes: { sonar: 12345 }, crossingEndlessBest: 3
    }));
  });
  await page.goto("/");
  await page.locator("#hdr-history").click();
  await expect(page.locator("#hi-records")).toContainText("Sonar");
  await expect(page.locator("#hi-records")).toContainText("Crossing");
  await expect(page.locator("#hi-records")).not.toContainText("No Timed or Endless records yet");
});

test("Records show the empty state with no best times recorded, and Settings has no records section at all", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("daybatch:v1", JSON.stringify({
      schema: 1, lastSeenDate: null, games: {}, history: [], onboardingShown: true,
      premium: { code: "LIFETIME1", tier: "lifetime", verifiedAt: Date.now(), expiresAt: null }
    }));
  });
  await page.goto("/");
  await page.locator("#hdr-history").click();
  await expect(page.locator("#hi-records")).toContainText("No Timed or Endless records yet");

  await page.locator("#hi-close").click();
  await page.locator("#sn-help").click();
  await page.locator("#h-settings").click();
  await expect(page.locator("#st-records")).toHaveCount(0);
});

test("Footer social row renders (stubbed, non-interactive) regardless of premium tier", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#footer-social")).toBeVisible();
  await expect(page.locator("#footer-social span")).toHaveCount(5);
});
