// B2 acceptance: rollover fires correctly across a simulated midnight,
// pinned to Pacific/Auckland (device-local rollover while the UTC date is
// unchanged), and never silently resets a live game.
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

test("NZ midnight rollover prompts for a new batch and never silently resets", async ({ page }) => {
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));

  await pinMutableClock(page);
  await page.goto("/");
  await expect(page.locator("#pane-sonar .board")).toBeVisible();

  // live game: one ping at 23:50 on the 10th
  const ships10 = [...genSonar(hashString("sonar-2026-7-10")).occ];
  await page.locator(`.sn-row button[data-i="${ships10[0]}"]`).click();
  await expect(page.locator("#pane-sonar .stat:has(.lb:text('PINGS')) .vl")).toHaveText("1");
  await expect(page.locator("#rollover")).toBeHidden();

  // cross Auckland midnight (+20 min). The UTC date must NOT change — this
  // pins that rollover is device-local, not UTC.
  const utcDays = await page.evaluate(() => {
    const before = new Date().getUTCDate();
    window.__dayOffsetMs = 20 * 60 * 1000;
    return [before, new Date().getUTCDate()];
  });
  expect(utcDays[0]).toBe(utcDays[1]);

  // app comes back into view → banner, and the live game is untouched
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.locator("#rollover")).toBeVisible();
  await expect(page.locator("#rollover")).toContainText("New batch is ready 🌅");
  await expect(page.locator("#pane-sonar .stat:has(.lb:text('PINGS')) .vl")).toHaveText("1");

  // accepting the prompt deals the 11th's puzzle: fresh pings, new edge counts
  await page.locator("#rollover-go").click();
  await expect(page.locator("#rollover")).toBeHidden();
  await expect(page.locator("#pane-sonar .stat:has(.lb:text('PINGS')) .vl")).toHaveText("0");
  const col11 = genSonar(hashString("sonar-2026-7-11")).colCounts.map(n => String(n));
  const header = page.locator("#pane-sonar .sn-row").first().locator(".sn-edge");
  const shown = await header.allTextContents();
  expect(shown.map(t => (t === "✓" ? "0" : t))).toEqual(col11);

  // and the banner does not come back on the next visibility check
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.locator("#rollover")).toBeHidden();
  expect(errors).toEqual([]);
});

test("reload after midnight loads fresh dailies directly, no prompt", async ({ page }) => {
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));
  await pinMutableClock(page);
  await page.goto("/");
  await expect(page.locator("#pane-sonar .board")).toBeVisible();
  const ships10 = [...genSonar(hashString("sonar-2026-7-10")).occ];
  await page.locator(`.sn-row button[data-i="${ships10[0]}"]`).click();

  // reload on the new day: stale snapshot ignored, today's puzzle, no banner
  await page.addInitScript(() => { window.__dayOffsetMs = 20 * 60 * 1000; });
  await page.reload();
  await expect(page.locator("#pane-sonar .board")).toBeVisible();
  await expect(page.locator("#pane-sonar .stat:has(.lb:text('PINGS')) .vl")).toHaveText("0");
  await expect(page.locator("#rollover")).toBeHidden();
  expect(errors).toEqual([]);
});
