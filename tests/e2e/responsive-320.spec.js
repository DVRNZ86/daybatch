// B5 acceptance: "no breakage at 320px width" — automated coverage. The
// Playwright suite otherwise only runs on the Pixel 7 profile (412px), which
// wouldn't catch a 320px-specific overflow regression. Rather than doubling
// the whole suite onto a second viewport project, this file targets the
// screens PLAN.md's B5 line actually touched (onboarding, settings, history,
// records) plus a baseline sweep of the five game boards, and asserts no
// horizontal overflow at the narrowest width Apple/most Android phones ship.
import { test, expect } from "@playwright/test";
import { gen as genSonar } from "../../src/games/sonar.js";
import { dailySeed } from "../../src/core/rng.js";

const WIDTH = 320, HEIGHT = 700;

async function seedPremiumWithHistory(page) {
  await page.addInitScript(() => {
    localStorage.setItem("daybatch:v1", JSON.stringify({
      schema: 1, lastSeenDate: null, games: {}, history: [
        { date: "2025-12-25", game: "sonar", tier: 1, metrics: { pings: 7, hintsUsed: 0, win: true } }
      ], onboardingShown: true,
      premium: { code: "LIFETIME1", tier: "lifetime", verifiedAt: Date.now(), expiresAt: null },
      bestTimes: { sonar: 12345 }, crossingEndlessBest: 3
    }));
  });
}

// No horizontal scrollbar/overflow anywhere on the page — the one true
// signal of "breaks at this width" regardless of which element is at fault.
async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${label}: document.documentElement.scrollWidth exceeds viewport width by ${overflow}px`).toBeLessThanOrEqual(1);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: WIDTH, height: HEIGHT });
});

test("320px: onboarding banner and each game tab render with no horizontal overflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#onboarding")).toBeVisible();
  await assertNoHorizontalOverflow(page, "onboarding banner");

  await page.locator("#ob-start").click();
  for (const tab of ["tally", "crossing", "sonar", "codebreak", "lexi"]) {
    await page.locator(`.tabs button[data-tab="${tab}"]`).click();
    await expect(page.locator(`#pane-${tab} .board`)).toBeVisible();
    await assertNoHorizontalOverflow(page, `${tab} tab`);
  }
});

test("320px: Settings overlay renders with no horizontal overflow", async ({ page }) => {
  await page.goto("/");
  await page.locator("#sn-help").click();
  await page.locator("#h-settings").click();
  await expect(page.locator("#settingsov.show")).toBeVisible();
  await assertNoHorizontalOverflow(page, "settings overlay");
});

test("320px: History overlay (with records + a populated date) renders with no horizontal overflow", async ({ page }) => {
  await seedPremiumWithHistory(page);
  await page.goto("/");
  await page.locator("#hdr-history").click();
  await expect(page.locator("#historyov.show")).toBeVisible();
  await expect(page.locator("#hi-records")).toContainText("Sonar");
  await assertNoHorizontalOverflow(page, "history overlay");
});

test("320px: premium and archive overlays render with no horizontal overflow", async ({ page }) => {
  await page.goto("/");
  await page.locator("#sn-help").click();
  await page.locator("#h-premium-open").click();
  await expect(page.locator("#premiumov.show")).toBeVisible();
  await assertNoHorizontalOverflow(page, "premium overlay");
  await page.locator("#pm-close").click();

  await seedPremiumWithHistory(page);
  await page.reload();
  await page.locator("#sn-archive").click();
  await expect(page.locator("#archiveov.show")).toBeVisible();
  await assertNoHorizontalOverflow(page, "archive overlay");
});

test("320px: win result modal renders with no horizontal overflow", async ({ page }) => {
  await page.goto("/");
  const puz = genSonar(dailySeed("sonar"));
  for (const i of puz.occ) {
    await page.locator(`.sn-row button[data-i="${i}"]`).click();
  }
  await expect(page.locator("#overlay.show")).toBeVisible();
  await assertNoHorizontalOverflow(page, "result modal");
});
