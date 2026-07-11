// B2 decisions: history records carry the puzzle's ISSUE date. Finishing
// yesterday's live game after midnight records under yesterday's date, and
// today's completion then records separately — two records, two dates.
// Pacific/Auckland with the mutable-clock pattern from rollover.spec.js.
import { test, expect } from "@playwright/test";
import { hashString } from "../../src/core/rng.js";
import { gen as genSonar } from "../../src/games/sonar.js";

test.use({ timezoneId: "Pacific/Auckland" });

// Clock pinned to 23:50 local on 10 July 2026, advanceable via __dayOffsetMs.
async function pinMutableClock(page) {
  await page.addInitScript(() => {
    window.__dayOffsetMs = 0;
    const RealDate = Date;
    const baseMs = new RealDate(2026, 6, 10, 23, 50, 0).getTime();
    window.Date = class extends RealDate {
      constructor(...args) {
        super();
        return args.length ? new RealDate(...args) : new RealDate(baseMs + window.__dayOffsetMs);
      }
      static now() { return baseMs + window.__dayOffsetMs; }
    };
  });
}

const history = page =>
  page.evaluate(() => JSON.parse(localStorage.getItem("daybatch:v1") || "{}").history || []);

test("finishing yesterday's game after NZ midnight records under yesterday's date; today's completion records separately", async ({ page }) => {
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));

  await pinMutableClock(page);
  await page.goto("/");
  await expect(page.locator("#pane-sonar .board")).toBeVisible();

  const ships10 = [...genSonar(hashString("sonar-2026-7-10")).occ];
  const ships11 = [...genSonar(hashString("sonar-2026-7-11")).occ];

  // one ping at 23:50 on the 10th, then cross Auckland midnight
  await page.locator(`.sn-row button[data-i="${ships10[0]}"]`).click();
  await page.evaluate(() => { window.__dayOffsetMs = 20 * 60 * 1000; });
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.locator("#rollover")).toBeVisible();

  // finish YESTERDAY's still-live game with the banner up: perfect, 7 pings
  for (const i of ships10.slice(1)) {
    await page.locator(`.sn-row button[data-i="${i}"]`).click();
  }
  await expect(page.locator("#overlay.show")).toBeVisible();
  await page.locator("#m-close").click();

  // recorded under the puzzle's issue date (the 10th), not the new day
  expect(await history(page)).toEqual([
    { date: "2026-7-10", game: "sonar", tier: 1, metrics: { pings: 7, win: true } }
  ]);

  // start today's batch: fresh daily for the 11th, finish it perfectly too
  await page.locator("#rollover-go").click();
  await expect(page.locator("#pane-sonar .stat:has(.lb:text('PINGS')) .vl")).toHaveText("0");
  for (const i of ships11) {
    await page.locator(`.sn-row button[data-i="${i}"]`).click();
  }
  await expect(page.locator("#overlay.show")).toBeVisible();
  await page.locator("#m-close").click();

  // both days stand in history as separate records
  expect(await history(page)).toEqual([
    { date: "2026-7-10", game: "sonar", tier: 1, metrics: { pings: 7, win: true } },
    { date: "2026-7-11", game: "sonar", tier: 1, metrics: { pings: 7, win: true } }
  ]);
  expect(errors).toEqual([]);
});
