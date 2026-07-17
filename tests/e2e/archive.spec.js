// D1: Archive (premium) — a date-picker overlay shared by all 5 games,
// replaying any past date's puzzle as an ephemeral practice session
// (never touches history/streaks). Verifies seed-identity: the puzzle
// generated for a picked date matches dailySeed(game, thatDate) exactly.
import { test, expect } from "@playwright/test";
import { dailySeed } from "../../src/core/rng.js";
import { gen as genSonar } from "../../src/games/sonar.js";
import { gen as genCodebreak } from "../../src/games/codebreak.js";

const PAST_DATE = new Date(2026, 2, 15); // 15 Mar 2026 — well before "today" in any test run
const PAST_DATE_INPUT = "2026-03-15";

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
async function pickArchiveDate(page, archiveBtnSelector, dateValue) {
  await page.locator(archiveBtnSelector).click();
  await expect(page.locator("#archiveov.show")).toBeVisible();
  await page.locator("#ar-date").fill(dateValue);
  await page.locator("#ar-go").click();
  await expect(page.locator("#archiveov.show")).toBeHidden();
}
const history = page => page.evaluate(() => JSON.parse(localStorage.getItem("daybatch:v1")).history);

test("Archive button is premium-only, on all 5 games", async ({ page }) => {
  await page.goto("/");
  for (const tab of ["tally", "crossing", "sonar", "codebreak", "lexi"]) {
    await page.locator(`.tabs button[data-tab="${tab}"]`).click();
    await expect(page.locator(`#pane-${tab} button:has-text("📅 Archive")`)).toHaveCount(0);
  }
});

test("Archive date input caps at yesterday (no future dates)", async ({ page }) => {
  await seedPremium(page);
  await openTab(page, "sonar");
  await page.locator("#sn-archive").click();
  await expect(page.locator("#archiveov.show")).toBeVisible();
  const max = await page.locator("#ar-date").getAttribute("max");
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const expected = yesterday.getFullYear() + "-" + String(yesterday.getMonth() + 1).padStart(2, "0") + "-" + String(yesterday.getDate()).padStart(2, "0");
  expect(max).toBe(expected);
});

test("Sonar archive: picking a past date generates that exact date's puzzle (seed-identity), MODE shows ARCHIVE, history untouched", async ({ page }) => {
  await seedPremium(page);
  await openTab(page, "sonar");
  await pickArchiveDate(page, "#sn-archive", PAST_DATE_INPUT);

  await expect(page.locator("#pane-sonar .stat:has(.lb:text('MODE')) .vl")).toHaveText("ARCHIVE");
  await expect(page.locator("#pane-sonar .stat:has(.lb:text('DATE')) .vl")).toHaveText("3/15");

  const { total } = genSonar(dailySeed("sonar", PAST_DATE));
  for (let i = 0; i < 49; i++) {
    if (await page.locator("#overlay.show").count()) break;
    await page.locator(`.sn-row button[data-i="${i}"]`).click();
  }
  await expect(page.locator("#pane-sonar .stat.big").filter({ hasText: "FOUND" }).locator(".vl")).toHaveText(`${total}/${total}`);
  expect(await history(page)).toEqual([]);
});

test("Codebreak archive: the guessable code matches dailySeed(game, date) for the picked date", async ({ page }) => {
  await seedPremium(page);
  await openTab(page, "codebreak");
  await pickArchiveDate(page, "#cb-archive", PAST_DATE_INPUT);
  await expect(page.locator("#pane-codebreak .stat:has(.lb:text('MODE')) .vl")).toHaveText("ARCHIVE");

  const code = genCodebreak(dailySeed("codebreak", PAST_DATE));
  for (const s of code) await page.locator(`.cb-keys button[data-k="${s}"]`).click();
  await page.locator("#cb-sub").click();
  await expect(page.locator("#overlay.show")).toBeVisible();
  await expect(page.locator("#m-title")).toHaveText(/Mastermind|Cracked it|Solid solve/);
  expect(await history(page)).toEqual([]);
});

test("Crossing, Tally, Lexi archive: date picker sets ARCHIVE mode and touches no history", async ({ page }) => {
  await seedPremium(page);

  await openTab(page, "crossing");
  await pickArchiveDate(page, "#cr-archive", PAST_DATE_INPUT);
  await expect(page.locator("#pane-crossing .stat:has(.lb:text('MODE')) .vl")).toHaveText("ARCHIVE");

  await openTab(page, "tally");
  await pickArchiveDate(page, "#ty-archive", PAST_DATE_INPUT);
  await expect(page.locator("#pane-tally .stat:has(.lb:text('DATE')) .vl")).toHaveText("3/15");

  await openTab(page, "lexi");
  await pickArchiveDate(page, "#lx-archive", PAST_DATE_INPUT);
  await expect(page.locator("#pane-lexi .stat:has(.lb:text('MODE')) .vl")).toHaveText("ARCHIVE");

  expect(await history(page)).toEqual([]);
});
