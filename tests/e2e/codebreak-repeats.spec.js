// D1: Codebreak: Repeats (premium) — repeated symbols allowed, 10 guesses,
// duplicate-letter Wordle verdict rules. Math.random is pinned so
// loadRepeats()'s seed is deterministic and solvable via genRepeats().
import { test, expect } from "@playwright/test";
import { genRepeats } from "../../src/games/codebreak.js";

async function seedPremium(page) {
  await page.addInitScript(() => {
    localStorage.setItem("daybatch:v1", JSON.stringify({
      schema: 1, lastSeenDate: null, games: {}, history: [],
      premium: { code: "LIFETIME1", tier: "lifetime", verifiedAt: Date.now(), expiresAt: null }
    }));
  });
}

async function pinRandom(page) {
  await page.addInitScript(() => { Math.random = () => 0.5; }); // seed 500000000
}

async function openCodebreak(page) {
  await page.goto("/");
  await page.locator('.tabs button[data-tab="codebreak"]').click();
  await expect(page.locator("#pane-codebreak .board")).toBeVisible();
}

async function guessSymbols(page, symbols) {
  for (const s of symbols) await page.locator(`.cb-keys button[data-k="${s}"]`).click();
  await page.locator("#cb-sub").click();
}

test("Repeats button is premium-only", async ({ page }) => {
  await openCodebreak(page);
  await expect(page.locator("#cb-repeats")).toHaveCount(0);
});

test("Repeats mode: keys stay enabled after reuse, MODE shows REPEATS, GUESSES caps at 10", async ({ page }) => {
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));

  await seedPremium(page);
  await pinRandom(page);
  await openCodebreak(page);
  await page.locator("#cb-repeats").click();

  await expect(page.locator("#pane-codebreak .stat:has(.lb:text('MODE')) .vl")).toHaveText("REPEATS");
  await expect(page.locator("#pane-codebreak .stat:has(.lb:text('GUESSES')) .vl")).toHaveText("0/10");

  // pick symbol 0 twice in a row — in normal mode the second click would be
  // disabled (used); in Repeats it must go through both times.
  await page.locator('.cb-keys button[data-k="0"]').click();
  await page.locator('.cb-keys button[data-k="0"]').click();
  await expect(page.locator(".cb-slot.filled")).toHaveCount(2);
  await page.locator('.cb-keys button[data-k="0"]').click();
  await page.locator('.cb-keys button[data-k="0"]').click();
  await page.locator('.cb-keys button[data-k="0"]').click();
  await page.locator("#cb-sub").click();
  await expect(page.locator("#pane-codebreak .stat:has(.lb:text('GUESSES')) .vl")).toHaveText("1/10");
  expect(errors).toEqual([]);
});

test("Repeats mode: solving the code (with a duplicate symbol, if the fixture has one) wins and never touches history", async ({ page }) => {
  await seedPremium(page);
  await pinRandom(page);
  await openCodebreak(page);
  await page.locator("#cb-repeats").click();

  const code = genRepeats(500000000);
  await guessSymbols(page, code);
  await expect(page.locator("#overlay.show")).toBeVisible();
  await expect(page.locator("#m-title")).toContainText(/Mastermind|Cracked|Solid|Close/);

  const history = await page.evaluate(() => JSON.parse(localStorage.getItem("daybatch:v1")).history);
  expect(history).toEqual([]);
});
